use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::types::{Job, JobStatus};

struct JobManagerInner {
    jobs: VecDeque<Job>,
    persist_path: Option<PathBuf>,
}

/// Thread-safe job queue manager with disk persistence.
/// Saves the queue as JSON in the app data directory on every mutation.
#[derive(Clone)]
pub struct JobManager {
    inner: Arc<Mutex<JobManagerInner>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(JobManagerInner {
                jobs: VecDeque::new(),
                persist_path: None,
            })),
        }
    }

    /// Initialize persistence path and load saved jobs from disk.
    /// Call once after Tauri setup provides the app data dir.
    pub async fn init_persistence(&self, app_data_dir: PathBuf) {
        std::fs::create_dir_all(&app_data_dir).ok();
        let path = app_data_dir.join("job_queue.json");

        let mut inner = self.inner.lock().await;
        inner.persist_path = Some(path.clone());

        // Load saved jobs if file exists
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(mut saved_jobs) = serde_json::from_str::<Vec<Job>>(&content) {
                    for job in &mut saved_jobs {
                        if job.status == JobStatus::Processing {
                            job.status = JobStatus::Queued;
                            job.progress = 0;
                        }
                    }
                    inner.jobs = VecDeque::from(saved_jobs);
                }
            }
        }
    }

    /// Persist current job queue to disk.
    fn persist(inner: &JobManagerInner) {
        if let Some(path) = &inner.persist_path {
            let snapshot: Vec<&Job> = inner.jobs.iter().collect();
            if let Ok(json) = serde_json::to_string(&snapshot) {
                std::fs::write(path, json).ok();
            }
        }
    }

    pub async fn add_job(&self, job: Job) {
        let mut inner = self.inner.lock().await;
        inner.jobs.push_back(job);
        Self::persist(&inner);
    }

    pub async fn get_all_jobs(&self) -> Vec<Job> {
        let inner = self.inner.lock().await;
        inner.jobs.iter().cloned().collect()
    }

    pub async fn cancel_job(&self, job_id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.iter_mut().find(|j| j.id == job_id) {
            match job.status {
                JobStatus::Queued | JobStatus::Processing => {
                    job.status = JobStatus::Cancelled;
                    Self::persist(&inner);
                    Ok(())
                }
                _ => Err("Job is not in a cancellable state".to_string()),
            }
        } else {
            Err("Job not found".to_string())
        }
    }

    pub async fn retry_job(&self, job_id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.iter_mut().find(|j| j.id == job_id) {
            if job.status == JobStatus::Failed {
                job.status = JobStatus::Queued;
                job.progress = 0;
                job.error = None;
                Self::persist(&inner);
                Ok(())
            } else {
                Err("Only failed jobs can be retried".to_string())
            }
        } else {
            Err("Job not found".to_string())
        }
    }

    pub async fn remove_job(&self, job_id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let initial_len = inner.jobs.len();
        inner.jobs.retain(|j| j.id != job_id);
        if inner.jobs.len() < initial_len {
            Self::persist(&inner);
            Ok(())
        } else {
            Err("Job not found".to_string())
        }
    }

    pub async fn update_progress(&self, job_id: &str, progress: u8) {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.iter_mut().find(|j| j.id == job_id) {
            job.progress = progress;
        }
        // Note: don't persist on every progress tick (too frequent, not critical data)
    }

    pub async fn set_status(&self, job_id: &str, status: JobStatus, error: Option<String>) {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.iter_mut().find(|j| j.id == job_id) {
            job.status = status;
            if let Some(err) = error {
                job.error = Some(err);
            }
            Self::persist(&inner);
        }
    }

    pub async fn move_job(&self, job_id: &str, direction: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let idx = inner.jobs.iter().position(|j| j.id == job_id)
            .ok_or_else(|| "Job not found".to_string())?;

        match direction {
            "up" if idx > 0 => {
                inner.jobs.swap(idx, idx - 1);
                Self::persist(&inner);
                Ok(())
            }
            "down" if idx < inner.jobs.len() - 1 => {
                inner.jobs.swap(idx, idx + 1);
                Self::persist(&inner);
                Ok(())
            }
            _ => Err("Cannot move job in that direction".to_string()),
        }
    }

    /// Remove all completed and cancelled jobs from the queue.
    pub async fn clear_completed(&self) {
        let mut inner = self.inner.lock().await;
        inner.jobs.retain(|j| j.status != JobStatus::Completed && j.status != JobStatus::Cancelled);
        Self::persist(&inner);
    }

    /// Get all queued jobs (status == Queued).
    pub async fn get_queued_jobs(&self) -> Vec<Job> {
        let inner = self.inner.lock().await;
        inner.jobs.iter().filter(|j| j.status == JobStatus::Queued).cloned().collect()
    }

    /// Check if a job has been cancelled.
    pub async fn is_cancelled(&self, job_id: &str) -> bool {
        let inner = self.inner.lock().await;
        inner.jobs.iter().any(|j| j.id == job_id && j.status == JobStatus::Cancelled)
    }

    /// Check if a job is still in Processing status.
    pub async fn is_processing(&self, job_id: &str) -> bool {
        let inner = self.inner.lock().await;
        inner.jobs.iter().any(|j| j.id == job_id && j.status == JobStatus::Processing)
    }

    /// Push an output path to a job.
    pub async fn push_output_path(&self, job_id: &str, path: String) {
        let mut inner = self.inner.lock().await;
        if let Some(job) = inner.jobs.iter_mut().find(|j| j.id == job_id) {
            job.output_paths.push(path);
            Self::persist(&inner);
        }
    }

    /// Get the output paths for a job.
    pub async fn get_output_paths(&self, job_id: &str) -> Vec<String> {
        let inner = self.inner.lock().await;
        inner.jobs.iter()
            .find(|j| j.id == job_id)
            .map(|j| j.output_paths.clone())
            .unwrap_or_default()
    }

    /// Get current progress for a job.
    pub async fn get_progress(&self, job_id: &str) -> u8 {
        let inner = self.inner.lock().await;
        inner.jobs.iter().find(|j| j.id == job_id).map(|j| j.progress).unwrap_or(0)
    }
}
