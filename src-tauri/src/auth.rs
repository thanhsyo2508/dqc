use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use url::Url;

const KEYRING_SERVICE: &str = "com.meiko.digitalqc";
const KEYRING_USER: &str = "google-oauth";
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    #[serde(skip_serializing)]
    pub id_token: String,
    pub email: String,
    pub name: String,
    pub picture: String,
    pub expires_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct StoredCredential {
    client_id: String,
    #[serde(default)]
    client_secret: String,
    refresh_token: String,
    email: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
    refresh_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::AuthSession;

    #[test]
    fn never_serializes_id_token_to_the_webview() {
        let session = AuthSession {
            id_token: "secret-id-token".to_string(),
            email: "qc@example.com".to_string(),
            name: "QC".to_string(),
            picture: String::new(),
            expires_at: 123,
        };
        let serialized = serde_json::to_value(session).expect("serialize auth session");
        assert!(serialized.get("idToken").is_none());
        assert_eq!(serialized["email"], "qc@example.com");
    }
}

#[derive(Debug, Deserialize)]
struct IdTokenClaims {
    aud: Value,
    exp: u64,
    iss: String,
    email: String,
    #[serde(default)]
    email_verified: bool,
    #[serde(default)]
    name: String,
    #[serde(default)]
    picture: String,
    nonce: Option<String>,
}

static SESSION: OnceLock<Mutex<Option<AuthSession>>> = OnceLock::new();

fn session_cache() -> &'static Mutex<Option<AuthSession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn random_urlsafe(byte_count: usize) -> String {
    let mut bytes = vec![0_u8; byte_count];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn credential_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| format!("Cannot open Windows Credential Manager: {error}"))
}

fn load_credential() -> Result<Option<StoredCredential>, String> {
    let entry = credential_entry()?;
    let serialized = match entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => return Err(format!("Cannot read Google credential: {error}")),
    };
    serde_json::from_str(&serialized)
        .map(Some)
        .map_err(|error| format!("Stored Google credential is invalid: {error}"))
}

fn save_credential(credential: &StoredCredential) -> Result<(), String> {
    let serialized = serde_json::to_string(credential)
        .map_err(|error| format!("Cannot serialize Google credential: {error}"))?;
    credential_entry()?
        .set_password(&serialized)
        .map_err(|error| format!("Cannot save Google credential securely: {error}"))
}

fn clear_credential() -> Result<(), String> {
    let entry = credential_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Cannot remove Google credential: {error}")),
    }
}

fn audience_matches(audience: &Value, client_id: &str) -> bool {
    audience.as_str() == Some(client_id)
        || audience
            .as_array()
            .is_some_and(|values| values.iter().any(|value| value.as_str() == Some(client_id)))
}

fn session_from_id_token(
    id_token: String,
    client_id: &str,
    expected_nonce: Option<&str>,
) -> Result<AuthSession, String> {
    let payload = id_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "Google returned an invalid ID token".to_string())?;
    let claims_bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "Google ID token payload is invalid".to_string())?;
    let claims: IdTokenClaims = serde_json::from_slice(&claims_bytes)
        .map_err(|_| "Google ID token claims are invalid".to_string())?;

    if !audience_matches(&claims.aud, client_id)
        || (claims.iss != "https://accounts.google.com" && claims.iss != "accounts.google.com")
        || !claims.email_verified
        || claims.exp <= unix_now()
    {
        return Err("Google ID token failed local validation".to_string());
    }
    if expected_nonce.is_some_and(|nonce| claims.nonce.as_deref() != Some(nonce)) {
        return Err("Google login nonce does not match".to_string());
    }

    Ok(AuthSession {
        id_token,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
        expires_at: claims.exp,
    })
}

fn callback_response(listener: TcpListener, expected_state: String) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Cannot configure OAuth callback: {error}"))?;
    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .map_err(|error| format!("Cannot configure OAuth stream: {error}"))?;
                let mut buffer = [0_u8; 16_384];
                let bytes_read = stream
                    .read(&mut buffer)
                    .map_err(|error| format!("Cannot read OAuth callback: {error}"))?;
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let target = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .ok_or_else(|| "OAuth callback request is invalid".to_string())?;
                let callback_url = Url::parse(&format!("http://127.0.0.1{target}"))
                    .map_err(|_| "OAuth callback URL is invalid".to_string())?;
                let params = callback_url
                    .query_pairs()
                    .into_owned()
                    .collect::<std::collections::HashMap<_, _>>();
                let success = params.get("state") == Some(&expected_state)
                    && params.contains_key("code")
                    && !params.contains_key("error");
                let message = if success {
                    "Đăng nhập thành công. Bạn có thể đóng cửa sổ này và quay lại Digital QC."
                } else {
                    "Đăng nhập không thành công. Hãy quay lại Digital QC và thử lại."
                };
                let body = format!("<!doctype html><meta charset=\"utf-8\"><title>Digital QC</title><style>body{{font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#10213d}}main{{max-width:560px;text-align:center;padding:32px}}h1{{color:#2563eb}}</style><main><h1>Digital QC</h1><p>{message}</p></main>");
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.as_bytes().len(), body);
                let _ = stream.write_all(response.as_bytes());

                if params.get("state") != Some(&expected_state) {
                    return Err("Google login state does not match".to_string());
                }
                if let Some(error) = params.get("error") {
                    return Err(format!("Google login was rejected: {error}"));
                }
                return params
                    .get("code")
                    .cloned()
                    .ok_or_else(|| "Google login returned no authorization code".to_string());
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                if std::time::Instant::now() >= deadline {
                    return Err("Google login timed out after 5 minutes".to_string());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(format!("OAuth callback failed: {error}")),
        }
    }
}

async fn token_request(parameters: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Cannot create Google OAuth client: {error}"))?;
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(parameters)
        .send()
        .await
        .map_err(|error| format!("Cannot contact Google OAuth: {error}"))?;
    let status = response.status();
    let token: TokenResponse = response
        .json()
        .await
        .map_err(|error| format!("Google OAuth returned invalid JSON: {error}"))?;
    if !status.is_success() || token.error.is_some() {
        return Err(token
            .error_description
            .or(token.error)
            .unwrap_or_else(|| format!("Google OAuth failed with HTTP {status}")));
    }
    Ok(token)
}

async fn refresh_session(credential: &StoredCredential) -> Result<AuthSession, String> {
    let token = token_request(&[
        ("client_id", credential.client_id.as_str()),
        ("client_secret", credential.client_secret.as_str()),
        ("refresh_token", credential.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ])
    .await?;
    let id_token = token
        .id_token
        .ok_or_else(|| "Google refresh response did not include an ID token".to_string())?;
    let session = session_from_id_token(id_token, &credential.client_id, None)?;
    *session_cache()
        .lock()
        .map_err(|_| "Auth session lock failed")? = Some(session.clone());
    Ok(session)
}

pub async fn login(client_id: String, client_secret: String) -> Result<AuthSession, String> {
    eprintln!("[Digital QC auth] Bắt đầu đăng nhập Google");
    if !client_id.ends_with(".apps.googleusercontent.com") {
        return Err(
            "VITE_GOOGLE_OAUTH_CLIENT_ID is not a valid Google OAuth client ID".to_string(),
        );
    }
    if client_secret.is_empty() {
        return Err("VITE_GOOGLE_OAUTH_CLIENT_SECRET is not configured".to_string());
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Cannot start local OAuth callback: {error}"))?;
    eprintln!("[Digital QC auth] Đã mở cổng callback nội bộ");
    let port = listener
        .local_addr()
        .map_err(|error| format!("Cannot read OAuth callback address: {error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/oauth/callback");
    let state = random_urlsafe(32);
    let nonce = random_urlsafe(32);
    let verifier = random_urlsafe(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    let mut authorization = Url::parse(GOOGLE_AUTH_URL).map_err(|error| error.to_string())?;
    authorization
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("nonce", &nonce)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent select_account");
    open::that(authorization.as_str())
        .map_err(|error| format!("Cannot open the system browser: {error}"))?;
    eprintln!("[Digital QC auth] Đã mở trình duyệt hệ thống");

    let code = tauri::async_runtime::spawn_blocking(move || callback_response(listener, state))
        .await
        .map_err(|error| format!("OAuth callback task failed: {error}"))??;
    eprintln!("[Digital QC auth] Đã nhận callback hợp lệ từ Google");
    let token = token_request(&[
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ])
    .await
    .map_err(|error| {
        eprintln!("[Digital QC auth] Đổi authorization code thất bại: {error}");
        error
    })?;
    eprintln!("[Digital QC auth] Đã đổi authorization code thành token");
    let id_token = token
        .id_token
        .ok_or_else(|| "Google login returned no ID token".to_string())?;
    let session = session_from_id_token(id_token, &client_id, Some(&nonce)).map_err(|error| {
        eprintln!("[Digital QC auth] Xác thực ID token thất bại: {error}");
        error
    })?;
    eprintln!("[Digital QC auth] ID token hợp lệ");
    let refresh_token = token.refresh_token.ok_or_else(|| {
        "Google login returned no refresh token; revoke the app grant and try again".to_string()
    })?;
    save_credential(&StoredCredential {
        client_id,
        client_secret,
        refresh_token,
        email: session.email.clone(),
    })
    .map_err(|error| {
        eprintln!("[Digital QC auth] Lưu phiên đăng nhập thất bại: {error}");
        error
    })?;
    eprintln!("[Digital QC auth] Đã lưu phiên đăng nhập an toàn");
    *session_cache()
        .lock()
        .map_err(|_| "Auth session lock failed")? = Some(session.clone());
    Ok(session)
}

pub async fn restore(client_id: String, client_secret: String) -> Result<Option<AuthSession>, String> {
    if let Some(session) = session_cache()
        .lock()
        .map_err(|_| "Auth session lock failed")?
        .clone()
        .filter(|session| session.expires_at > unix_now() + 60)
    {
        return Ok(Some(session));
    }
    let Some(mut credential) = load_credential()? else {
        return Ok(None);
    };
    if credential.client_id != client_id {
        clear_credential()?;
        return Ok(None);
    }
    if credential.client_secret != client_secret {
        credential.client_secret = client_secret;
        save_credential(&credential)?;
    }
    refresh_session(&credential).await.map(Some)
}

pub async fn valid_id_token() -> Result<String, String> {
    if let Some(session) = session_cache()
        .lock()
        .map_err(|_| "Auth session lock failed")?
        .clone()
        .filter(|session| session.expires_at > unix_now() + 60)
    {
        return Ok(session.id_token);
    }
    let credential = load_credential()?
        .ok_or_else(|| "Google sign-in is required before uploading".to_string())?;
    Ok(refresh_session(&credential).await?.id_token)
}

pub async fn logout() -> Result<(), String> {
    let credential = load_credential()?;
    if let Some(credential) = credential {
        let client = reqwest::Client::builder()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|error| error.to_string())?;
        let _ = client
            .post(GOOGLE_REVOKE_URL)
            .form(&[("token", credential.refresh_token.as_str())])
            .send()
            .await;
    }
    clear_credential()?;
    *session_cache()
        .lock()
        .map_err(|_| "Auth session lock failed")? = None;
    Ok(())
}
