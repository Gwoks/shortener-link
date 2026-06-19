//! cuid generation — matches Prisma's `cuid()` (cuid v1) so id shapes are consistent.

pub fn cuid() -> String {
    cuid::cuid1().expect("cuid1 generation should not fail")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuid_has_expected_shape() {
        let id = cuid();
        assert!(id.starts_with('c'), "cuid v1 starts with 'c': {id}");
        assert!(id.len() >= 24, "cuid v1 is ~25 chars: {id}");
        assert_ne!(cuid(), cuid());
    }
}
