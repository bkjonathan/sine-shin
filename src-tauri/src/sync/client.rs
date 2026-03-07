use reqwest::{Client, Method, RequestBuilder};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tracing::{debug, warn};

use crate::error::{AppError, AppResult};

/// Authenticated Supabase HTTP client used by services.
#[derive(Clone, Debug)]
pub struct SupabaseClient {
    client: Client,
}

impl SupabaseClient {
    /// Creates a Supabase client using the shared reqwest client instance.
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// Sends a GET request and deserializes the JSON response.
    pub async fn get_json<T>(
        &self,
        url: &str,
        service_key: &str,
        operation: &'static str,
    ) -> AppResult<T>
    where
        T: DeserializeOwned,
    {
        let payload = self
            .send_raw::<serde_json::Value>(Method::GET, url, service_key, None, operation)
            .await?;
        parse_json_payload(payload, operation)
    }

    /// Sends a POST request with a JSON body and deserializes the JSON response.
    pub async fn post_json<T, B>(
        &self,
        url: &str,
        service_key: &str,
        body: &B,
        operation: &'static str,
    ) -> AppResult<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let payload = self
            .send_raw(Method::POST, url, service_key, Some(body), operation)
            .await?;
        parse_json_payload(payload, operation)
    }

    /// Sends a PUT request with a JSON body and deserializes the JSON response.
    pub async fn put_json<T, B>(
        &self,
        url: &str,
        service_key: &str,
        body: &B,
        operation: &'static str,
    ) -> AppResult<T>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let payload = self
            .send_raw(Method::PUT, url, service_key, Some(body), operation)
            .await?;
        parse_json_payload(payload, operation)
    }

    /// Sends a DELETE request and expects a successful status with no body parsing.
    pub async fn delete_empty(
        &self,
        url: &str,
        service_key: &str,
        operation: &'static str,
    ) -> AppResult<()> {
        self.send_raw::<serde_json::Value>(Method::DELETE, url, service_key, None, operation)
            .await?;
        Ok(())
    }

    async fn send_raw<B>(
        &self,
        method: Method,
        url: &str,
        service_key: &str,
        body: Option<&B>,
        operation: &'static str,
    ) -> AppResult<String>
    where
        B: Serialize + ?Sized,
    {
        let method_name = method.as_str().to_owned();
        debug!(operation, method = %method_name, url, "sending Supabase request");

        let mut request = self.request(method, url, service_key);
        if let Some(payload) = body {
            request = request
                .header("Content-Type", "application/json")
                .json(payload);
        }

        let response = request.send().await?;
        let status = response.status();
        let payload = response.text().await?;

        if !status.is_success() {
            warn!(
                operation,
                status = status.as_u16(),
                "Supabase request failed"
            );
            return Err(AppError::supabase_request_failed(
                operation,
                status.as_u16(),
                payload,
            ));
        }

        debug!(
            operation,
            status = status.as_u16(),
            "Supabase request completed"
        );

        Ok(payload)
    }

    fn request(&self, method: Method, url: &str, service_key: &str) -> RequestBuilder {
        self.client
            .request(method, url)
            .header("apikey", service_key)
            .header("Authorization", format!("Bearer {service_key}"))
    }
}

fn parse_json_payload<T>(payload: String, operation: &'static str) -> AppResult<T>
where
    T: DeserializeOwned,
{
    serde_json::from_str::<T>(&payload)
        .map_err(|error| AppError::invalid_api_response(operation, error))
}
