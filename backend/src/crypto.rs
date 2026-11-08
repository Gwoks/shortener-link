//! Shared crypto helpers — the single HMAC-SHA256 implementation used by the
//! unlock tokens and the guest-cookie key hash.
//!
//! Implemented over `sha2` (RFC 2104) to avoid adding an `hmac` crate dependency.

use sha2::{Digest, Sha256};

/// SHA-256 block size in bytes.
const BLOCK_SIZE: usize = 64;

/// HMAC-SHA256(key, message).
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let key_block = normalized_key(key);
    let ipad: [u8; BLOCK_SIZE] = std::array::from_fn(|i| key_block[i] ^ 0x36);
    let opad: [u8; BLOCK_SIZE] = std::array::from_fn(|i| key_block[i] ^ 0x5c);

    let inner = Sha256::new()
        .chain_update(ipad)
        .chain_update(message)
        .finalize();
    Sha256::new()
        .chain_update(opad)
        .chain_update(inner)
        .finalize()
        .into()
}

/// HMAC-SHA256(key, message) as lowercase hex.
pub fn hmac_hex(key: &[u8], message: &[u8]) -> String {
    hex::encode(hmac_sha256(key, message))
}

/// Opaque storage key for a guest cookie id: HMAC-SHA256(pepper, "guest|"+id) → hex.
/// Guest links are persisted under this hash, so its output must never change.
pub fn guest_key_hash(pepper: &str, guest_id: &str) -> String {
    hmac_hex(pepper.as_bytes(), format!("guest|{guest_id}").as_bytes())
}

/// Keys longer than one block are hashed first; shorter keys are zero-padded.
fn normalized_key(key: &[u8]) -> [u8; BLOCK_SIZE] {
    let mut block = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    block
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_matches_known_vector() {
        // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
        let mac = hmac_sha256(b"key", b"The quick brown fox jumps over the lazy dog");
        assert_eq!(
            hex::encode(mac),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
    }

    #[test]
    fn hmac_hashes_keys_longer_than_one_block() {
        let key = [b'k'; 100];
        assert_eq!(
            hmac_hex(&key, b"guest|x"),
            "041eedd3d2f45cb9cd17353b6f6c88c1c28874b7319944a8b0c21ee1cb788ccf"
        );
    }

    #[test]
    fn guest_key_hash_is_stable_for_existing_cookies() {
        // Reference computed with Python's hmac module; guards stored guest links.
        assert_eq!(
            guest_key_hash("test-pepper", "cguest123"),
            "21397b260fd8f297c1d67592ac89e1d92db60dc5733b7b57ffd4d7152f0c50b5"
        );
    }
}
