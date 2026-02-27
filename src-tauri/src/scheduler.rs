use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_cron_scheduler::{Job, JobScheduler};
use tauri::AppHandle;
use crate::commands::settings::get_app_settings;
use crate::commands::drive::perform_drive_backup;

// The current scheduled job id
pub struct SchedulerState {
    pub sched: JobScheduler,
    pub job_id: Option<uuid::Uuid>,
}

pub async fn setup_scheduler(app: AppHandle) -> Arc<Mutex<SchedulerState>> {
    let sched = JobScheduler::new().await.unwrap();
    sched.start().await.unwrap();
    let state = Arc::new(Mutex::new(SchedulerState { sched, job_id: None }));
    
    update_scheduler(&app, &state).await;
    state
}

pub async fn update_scheduler(app: &AppHandle, state: &Arc<Mutex<SchedulerState>>) {
    let settings = get_app_settings(app.clone()).unwrap_or_default();
    let mut state_lock = state.lock().await;

    if let Some(id) = state_lock.job_id {
        let _ = state_lock.sched.remove(&id).await;
        state_lock.job_id = None;
    }

    if !settings.auto_backup || settings.backup_frequency == "never" || settings.backup_frequency.is_empty() {
        return;
    }

    let time_parts: Vec<&str> = settings.backup_time.split(':').collect();
    if time_parts.len() != 2 { return; }
    let hour = time_parts[0];
    let minute = time_parts[1];

    let cron_expr = match settings.backup_frequency.as_str() {
        "daily" => format!("0 {} {} * * *", minute, hour),
        "weekly" => format!("0 {} {} * * 0", minute, hour), // Sunday
        "monthly" => format!("0 {} {} 1 * *", minute, hour), // 1st of month
        _ => return,
    };

    let app_clone = app.clone();
    match Job::new_async(cron_expr.as_str(), move |_uuid, mut _l| {
        let app_task = app_clone.clone();
        Box::pin(async move {
            println!("Running scheduled drive backup...");
            let _ = perform_drive_backup(&app_task).await;
        })
    }) {
        Ok(job) => {
            if let Ok(id) = state_lock.sched.add(job).await {
                state_lock.job_id = Some(id);
            }
        },
        Err(e) => {
            eprintln!("Failed to schedule backup job: {}", e);
        }
    }
}

#[tauri::command]
pub async fn reload_scheduler(app: AppHandle, state: tauri::State<'_, Arc<Mutex<SchedulerState>>>) -> Result<(), String> {
    update_scheduler(&app, &*state).await;
    Ok(())
}
