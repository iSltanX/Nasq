// خزنة السرّ — مفتاح المزوّد في سلسلة مفاتيح الماك بدل نصّ صريح في
// settings.json. جزء من الأساس المشترك: تخزين خام لا يعرف برجًا ولا عقدًا،
// ولا يمرّ به نصّ المستخدم ولا أي prompt.
//
// قاعدة السلامة الحاكمة هنا: التمييز بين «غائب» و«تعذّرت القراءة».
// الغياب حالة معروفة يجوز معها الحذف والكتابة، أما تعذّر القراءة — عطلٌ أو
// رفض وصول — فيمنع كل تصرّف قد يُفقد مفتاحًا موجودًا.

pub(crate) const SERVICE: &str = "com.nasaq.app";
pub(crate) const ACCOUNT_API_KEY: &str = "api-key";

const ERR_STORE_READ: &str = "تعذّرت قراءة المفتاح من سلسلة المفاتيح.";
const ERR_STORE_WRITE: &str = "تعذّر حفظ المفتاح في سلسلة المفاتيح.";

pub(crate) trait SecretStore {
    /// Ok(None) غياب مؤكَّد، وErr تعذُّر قراءة — لا يُخلط بينهما
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn set(&self, account: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

#[cfg(target_os = "macos")]
pub(crate) struct Keychain;

#[cfg(target_os = "macos")]
impl SecretStore for Keychain {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        use security_framework::passwords::get_generic_password;
        match get_generic_password(SERVICE, account) {
            Ok(bytes) => match String::from_utf8(bytes) {
                Ok(secret) => Ok(Some(secret)),
                // قيمة غير نصية: تُعامل كتعذُّر قراءة لا كغياب، فلا تُمحى
                Err(_) => Err(ERR_STORE_READ.to_string()),
            },
            Err(e) if is_not_found(&e) => Ok(None),
            Err(_) => Err(ERR_STORE_READ.to_string()),
        }
    }

    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        use security_framework::passwords::set_generic_password;
        set_generic_password(SERVICE, account, secret.as_bytes())
            .map_err(|_| ERR_STORE_WRITE.to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        use security_framework::passwords::delete_generic_password;
        match delete_generic_password(SERVICE, account) {
            Ok(()) => Ok(()),
            Err(e) if is_not_found(&e) => Ok(()),
            Err(_) => Err(ERR_STORE_WRITE.to_string()),
        }
    }
}

/// errSecItemNotFound — العنصر غير موجود، وهي حالة طبيعية لا عطل
#[cfg(target_os = "macos")]
fn is_not_found(e: &security_framework::base::Error) -> bool {
    e.code() == -25300
}

// التطبيق للماك وحده، لكن الشجرة تبقى قابلة للبناء في غيره: خزنة تعلن عجزها
// صراحةً بدل أن تدّعي غيابًا يسمح بالحذف
#[cfg(not(target_os = "macos"))]
pub(crate) struct Keychain;

#[cfg(not(target_os = "macos"))]
impl SecretStore for Keychain {
    fn get(&self, _account: &str) -> Result<Option<String>, String> {
        Err(ERR_STORE_READ.to_string())
    }
    fn set(&self, _account: &str, _secret: &str) -> Result<(), String> {
        Err(ERR_STORE_WRITE.to_string())
    }
    fn delete(&self, _account: &str) -> Result<(), String> {
        Err(ERR_STORE_WRITE.to_string())
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    /// خزنة في الذاكرة للاختبارات — لا تلمس سلسلة مفاتيح الجهاز إطلاقًا،
    /// فلا يظهر طلب وصول أثناء cargo test
    pub(crate) struct MemoryStore {
        items: RefCell<HashMap<String, String>>,
        pub(crate) fail_get: bool,
        pub(crate) fail_set: bool,
    }

    impl MemoryStore {
        pub(crate) fn new() -> Self {
            MemoryStore {
                items: RefCell::new(HashMap::new()),
                fail_get: false,
                fail_set: false,
            }
        }

        pub(crate) fn with(account: &str, secret: &str) -> Self {
            let store = MemoryStore::new();
            store
                .items
                .borrow_mut()
                .insert(account.to_string(), secret.to_string());
            store
        }

        pub(crate) fn peek(&self, account: &str) -> Option<String> {
            self.items.borrow().get(account).cloned()
        }
    }

    impl SecretStore for MemoryStore {
        fn get(&self, account: &str) -> Result<Option<String>, String> {
            if self.fail_get {
                return Err(ERR_STORE_READ.to_string());
            }
            Ok(self.items.borrow().get(account).cloned())
        }

        fn set(&self, account: &str, secret: &str) -> Result<(), String> {
            if self.fail_set {
                return Err(ERR_STORE_WRITE.to_string());
            }
            self.items
                .borrow_mut()
                .insert(account.to_string(), secret.to_string());
            Ok(())
        }

        fn delete(&self, account: &str) -> Result<(), String> {
            self.items.borrow_mut().remove(account);
            Ok(())
        }
    }
}
