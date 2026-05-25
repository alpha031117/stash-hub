use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

fn tokens_path(app: &tauri::AppHandle, company_id: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("google_tokens_{}.json", company_id)))
}

#[derive(Serialize, Deserialize, Clone)]
struct StoredTokens {
    client_id: String,
    client_secret: String,
    access_token: String,
    refresh_token: String,
    expires_at: i64,
}

fn load_tokens(app: &tauri::AppHandle, company_id: &str) -> Result<StoredTokens, String> {
    let path = tokens_path(app, company_id)?;
    let json = std::fs::read_to_string(&path).map_err(|_| "Not connected".to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

fn save_tokens(
    app: &tauri::AppHandle,
    company_id: &str,
    tokens: &StoredTokens,
) -> Result<(), String> {
    let path = tokens_path(app, company_id)?;
    let json = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

async fn get_valid_access_token(
    app: &tauri::AppHandle,
    company_id: &str,
    tokens: &StoredTokens,
) -> Result<(String, Option<StoredTokens>), String> {
    let now = Utc::now().timestamp();
    if tokens.expires_at - now > 60 {
        return Ok((tokens.access_token.clone(), None));
    }

    let client = Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", tokens.client_id.as_str()),
            ("client_secret", tokens.client_secret.as_str()),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = data["error"].as_str() {
        return Err(format!("Token refresh failed: {}", err));
    }

    let new_access_token = data["access_token"]
        .as_str()
        .ok_or("No access_token in refresh response")?
        .to_string();
    let expires_in = data["expires_in"].as_i64().unwrap_or(3600);

    let updated = StoredTokens {
        client_id: tokens.client_id.clone(),
        client_secret: tokens.client_secret.clone(),
        access_token: new_access_token.clone(),
        refresh_token: tokens.refresh_token.clone(),
        expires_at: now + expires_in,
    };

    let _ = save_tokens(app, company_id, &updated);
    Ok((new_access_token, Some(updated)))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub starts_at: String,
    pub ends_at: String,
    pub url: Option<String>,
    pub is_all_day: bool,
}

#[tauri::command]
pub fn google_is_connected(app: tauri::AppHandle, company_id: String) -> bool {
    load_tokens(&app, &company_id).is_ok()
}

#[tauri::command]
pub async fn google_exchange_code(
    app: tauri::AppHandle,
    company_id: String,
    client_id: String,
    client_secret: String,
    code: String,
    code_verifier: String,
    redirect_uri: String,
) -> Result<(), String> {
    let client = Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code_verifier", code_verifier.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = data["error"].as_str() {
        return Err(format!(
            "Token exchange failed: {} — {}",
            err,
            data["error_description"].as_str().unwrap_or("")
        ));
    }

    let access_token = data["access_token"]
        .as_str()
        .ok_or("No access_token")?
        .to_string();
    let refresh_token = data["refresh_token"]
        .as_str()
        .ok_or("No refresh_token — ensure access_type=offline&prompt=consent was set")?
        .to_string();
    let expires_in = data["expires_in"].as_i64().unwrap_or(3600);

    save_tokens(
        &app,
        &company_id,
        &StoredTokens {
            client_id,
            client_secret,
            access_token,
            refresh_token,
            expires_at: Utc::now().timestamp() + expires_in,
        },
    )
}

#[tauri::command]
pub async fn google_fetch_meetings(
    app: tauri::AppHandle,
    company_id: String,
) -> Result<Vec<Meeting>, String> {
    let tokens = load_tokens(&app, &company_id)?;
    let (access_token, _) = get_valid_access_token(&app, &company_id, &tokens).await?;

    let now = Utc::now();
    let time_min = now.to_rfc3339();
    let time_max = (now + chrono::Duration::days(30)).to_rfc3339();

    let client = Client::new();
    let resp = client
        .get("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&access_token)
        .query(&[
            ("timeMin", time_min.as_str()),
            ("timeMax", time_max.as_str()),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
            ("maxResults", "50"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Calendar API {}: {}", status, body));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = data["items"].as_array().cloned().unwrap_or_default();

    Ok(items
        .iter()
        .filter_map(|item| {
            let id = item["id"].as_str()?.to_string();
            let title = item["summary"].as_str().unwrap_or("(No title)").to_string();

            let (starts_at, is_all_day) = if let Some(dt) = item["start"]["dateTime"].as_str() {
                (dt.to_string(), false)
            } else if let Some(d) = item["start"]["date"].as_str() {
                (format!("{}T00:00:00Z", d), true)
            } else {
                return None;
            };

            let ends_at = if let Some(dt) = item["end"]["dateTime"].as_str() {
                dt.to_string()
            } else if let Some(d) = item["end"]["date"].as_str() {
                format!("{}T00:00:00Z", d)
            } else {
                return None;
            };

            let url = item["hangoutLink"]
                .as_str()
                .or_else(|| item["conferenceData"]["entryPoints"][0]["uri"].as_str())
                .map(String::from);

            Some(Meeting {
                id,
                title,
                starts_at,
                ends_at,
                url,
                is_all_day,
            })
        })
        .collect())
}

#[tauri::command]
pub fn google_disconnect(app: tauri::AppHandle, company_id: String) -> Result<(), String> {
    let path = tokens_path(&app, &company_id)?;
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}
