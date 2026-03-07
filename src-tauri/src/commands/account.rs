use std::sync::Arc;

use tauri::State;
use tracing::instrument;

use crate::error::AppError;
use crate::models::AccountSummary;
use crate::services::account;
use crate::state::AppState;

/// Returns account totals and monthly summary values.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_account_summary(
    state: State<'_, Arc<AppState>>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<AccountSummary, AppError> {
    account::get_account_summary(state.inner().clone(), date_from, date_to).await
}
