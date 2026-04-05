use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::path::Path;

const ENCRYPTED_PREFIX: &str = "enc:";
const NONCE_LEN: usize = 12;

fn get_or_create_key(app_data_dir: &Path) -> Vec<u8> {
    let key_path = app_data_dir.join("key.bin");
    if key_path.exists() {
        if let Ok(bytes) = fs::read(&key_path) {
            if bytes.len() == 32 {
                return bytes;
            }
        }
    }
    let key = Aes256Gcm::generate_key(OsRng);
    let key_bytes = key.to_vec();
    let _ = fs::write(&key_path, &key_bytes);
    key_bytes
}

pub fn encrypt_value(app_data_dir: &Path, plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    // Don't double-encrypt values that are already encrypted
    if plaintext.starts_with(ENCRYPTED_PREFIX) {
        return plaintext.to_string();
    }

    let key_bytes = get_or_create_key(app_data_dir);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    match cipher.encrypt(&nonce, plaintext.as_bytes()) {
        Ok(ciphertext) => {
            let mut combined = nonce.to_vec();
            combined.extend_from_slice(&ciphertext);
            format!("{}{}", ENCRYPTED_PREFIX, STANDARD.encode(&combined))
        }
        Err(_) => plaintext.to_string(),
    }
}

pub fn decrypt_value(app_data_dir: &Path, value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    if !value.starts_with(ENCRYPTED_PREFIX) {
        // Plain text from before encryption was added — return as-is so it can be re-saved encrypted
        return value.to_string();
    }

    let encoded = &value[ENCRYPTED_PREFIX.len()..];
    let combined = match STANDARD.decode(encoded) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };

    if combined.len() <= NONCE_LEN {
        return String::new();
    }

    let key_bytes = get_or_create_key(app_data_dir);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&combined[..NONCE_LEN]);
    let ciphertext = &combined[NONCE_LEN..];

    match cipher.decrypt(nonce, ciphertext) {
        Ok(plaintext) => String::from_utf8(plaintext).unwrap_or_default(),
        Err(_) => String::new(),
    }
}
