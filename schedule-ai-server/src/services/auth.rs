use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenUrl,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    models::{GoogleUserInfo, RefreshToken, User, UserResponse},
};

/// Google OAuth token response
#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    #[allow(dead_code)]
    expires_in: u64,
    #[allow(dead_code)]
    token_type: String,
}

/// JWT Claims (exp, iat must be i64 per JWT spec)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String, // user_id
    pub email: String,
    pub exp: i64,
    pub iat: i64,
}

/// Auth response with tokens
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: UserResponse,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

/// Token refresh response
#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub expires_in: u64,
}

pub struct AuthService {
    db: PgPool,
    config: Config,
    oauth_client: BasicClient,
    http_client: reqwest::Client,
}

impl AuthService {
    pub fn new(db: PgPool, config: Config) -> Self {
        let oauth_client = BasicClient::new(
            ClientId::new(config.google_client_id.clone()),
            Some(ClientSecret::new(config.google_client_secret.clone())),
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string()).unwrap(),
            Some(TokenUrl::new("https://oauth2.googleapis.com/token".to_string()).unwrap()),
        )
        .set_redirect_uri(RedirectUrl::new(config.google_redirect_uri.clone()).unwrap());

        Self {
            db,
            config,
            oauth_client,
            http_client: reqwest::Client::new(),
        }
    }

    /// Generate OAuth authorization URL
    pub fn get_auth_url(&self) -> (String, CsrfToken, PkceCodeVerifier) {
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        let (auth_url, csrf_token) = self
            .oauth_client
            .authorize_url(CsrfToken::new_random)
            .add_scope(Scope::new("openid".to_string()))
            .add_scope(Scope::new("email".to_string()))
            .add_scope(Scope::new("profile".to_string()))
            .set_pkce_challenge(pkce_challenge)
            .url();

        (auth_url.to_string(), csrf_token, pkce_verifier)
    }

    /// Exchange authorization code for tokens and get user info
    pub async fn exchange_code(
        &self,
        code: String,
        pkce_verifier: PkceCodeVerifier,
    ) -> AppResult<AuthResponse> {
        // Exchange code for Google access token using direct HTTP request
        let token_response = self
            .http_client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code.as_str()),
                ("client_id", &self.config.google_client_id),
                ("client_secret", &self.config.google_client_secret),
                ("redirect_uri", &self.config.google_redirect_uri),
                ("grant_type", "authorization_code"),
                ("code_verifier", pkce_verifier.secret()),
            ])
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to exchange code: {}", e)))?;

        if !token_response.status().is_success() {
            let error_text = token_response.text().await.unwrap_or_default();
            return Err(AppError::ExternalApi(format!(
                "Failed to exchange code: {}",
                error_text
            )));
        }

        let google_tokens: GoogleTokenResponse = token_response
            .json()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse token response: {}", e)))?;

        let google_access_token = &google_tokens.access_token;

        // Get user info from Google
        let user_info = self.get_google_user_info(google_access_token).await?;

        // Create or update user
        let user = self.upsert_user(&user_info).await?;

        // Generate tokens
        let access_token = self.generate_access_token(&user)?;
        let refresh_token = self.generate_refresh_token(&user).await?;

        Ok(AuthResponse {
            user: user.into(),
            access_token,
            refresh_token,
            expires_in: self.config.jwt_expires_in,
        })
    }

    /// Get user info from Google
    async fn get_google_user_info(&self, access_token: &str) -> AppResult<GoogleUserInfo> {
        let response = self
            .http_client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to get user info: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalApi(
                "Failed to get user info from Google".to_string(),
            ));
        }

        response
            .json::<GoogleUserInfo>()
            .await
            .map_err(|e| AppError::ExternalApi(format!("Failed to parse user info: {}", e)))
    }

    /// Create or update user
    async fn upsert_user(&self, info: &GoogleUserInfo) -> AppResult<User> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (google_id, email, name, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (google_id) DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                avatar_url = EXCLUDED.avatar_url,
                updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(&info.id)
        .bind(&info.email)
        .bind(&info.name)
        .bind(&info.picture)
        .fetch_one(&self.db)
        .await?;

        Ok(user)
    }

    /// Generate JWT access token
    fn generate_access_token(&self, user: &User) -> AppResult<String> {
        let now = Utc::now();
        let exp = now + Duration::seconds(self.config.jwt_expires_in as i64);

        let claims = Claims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            iat: now.timestamp(),
            exp: exp.timestamp(),
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.config.jwt_secret.as_bytes()),
        )
        .map_err(|e| AppError::Internal(format!("Failed to generate token: {}", e)))
    }

    /// Generate and store refresh token
    async fn generate_refresh_token(&self, user: &User) -> AppResult<String> {
        // Generate random token
        let token: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(64)
            .map(char::from)
            .collect();

        // Hash the token for storage
        let token_hash = format!("{:x}", Sha256::digest(token.as_bytes()));

        let expires_at = Utc::now() + Duration::seconds(self.config.refresh_token_expires_in as i64);

        // Store in database
        sqlx::query(
            r#"
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            "#,
        )
        .bind(user.id)
        .bind(&token_hash)
        .bind(expires_at)
        .execute(&self.db)
        .await?;

        Ok(token)
    }

    /// Verify and decode JWT access token
    pub fn verify_access_token(&self, token: &str) -> AppResult<Claims> {
        decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map(|data| data.claims)
        .map_err(|_| AppError::Unauthorized)
    }

    /// Refresh access token using refresh token
    pub async fn refresh_access_token(&self, refresh_token: &str) -> AppResult<RefreshResponse> {
        let token_hash = format!("{:x}", Sha256::digest(refresh_token.as_bytes()));

        // Find refresh token and associated user
        let record = sqlx::query_as::<_, RefreshToken>(
            r#"
            SELECT * FROM refresh_tokens
            WHERE token_hash = $1 AND expires_at > NOW()
            "#,
        )
        .bind(&token_hash)
        .fetch_optional(&self.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

        // Get user
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(record.user_id)
            .fetch_one(&self.db)
            .await?;

        // Generate new access token
        let access_token = self.generate_access_token(&user)?;

        Ok(RefreshResponse {
            access_token,
            expires_in: self.config.jwt_expires_in,
        })
    }

    /// Revoke refresh token (logout)
    pub async fn revoke_refresh_token(&self, refresh_token: &str) -> AppResult<()> {
        let token_hash = format!("{:x}", Sha256::digest(refresh_token.as_bytes()));

        sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
            .bind(&token_hash)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    /// Get user by ID
    pub async fn get_user_by_id(&self, user_id: Uuid) -> AppResult<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&self.db)
            .await?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))
    }

    /// Clean up expired refresh tokens (should be run periodically)
    pub async fn cleanup_expired_tokens(&self) -> AppResult<u64> {
        let result = sqlx::query("DELETE FROM refresh_tokens WHERE expires_at < NOW()")
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected())
    }
}
