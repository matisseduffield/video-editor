use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::types::{Job, JobStatus};

/// Thread-safe job queue manager.
/// Manages the queue of processing jobs and limits concurrent execution.
#[derive(Clone)]
pub struct JobManager {
    pub jobs: Arc<Mutex<VecDeque<Job>>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    pub async fn add_job(&self, job: Job) {
        let mut jobs = self.jobs.lock().await;
        jobs.push_back(job);
    }

    pub async fn get_all_jobs(&self) -> Vec<Job> {
        let jobs = self.jobs.lock().await;
        jobs.iter().cloned().collect()
    }

    pub async fn cancel_job(&self, job_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.iter_mut().find(|j| j.id == job_id) {
            match job.status {
                JobStatus::Queued | JobStatus::Processing => {
                    job.status = JobStatus::Cancelled;
                    Ok(())
                }
                _ => Err("Job is not in a cancellable state".to_string()),
            }
        } else {
            Err("Job not found".to_string())
        }
    }

    pub async fn retry_job(&self, job_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.iter_mut().find(|j| j.id == job_id) {
            if job.status == JobStatus::Failed {
                job.status = JobStatus::Queued;
                job.progress = 0;
                job.error = None;
                Ok(())
            } else {
                Err("Only failed jobs can be retried".to_string())
            }
        } else {
            Err("Job not found".to_string())
        }
    }

    pub async fn remove_job(&self, job_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let initial_len = jobs.len();
        jobs.retain(|j| j.id != job_id);
        if jobs.len() < initial_len {
            Ok(())
        } else {
            Err("Job not found".to_string())
        }
    }

    pub async fn update_progress(&self, job_id: &str, progress: u8) {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.iter_mut().find(|j| j.id == job_id) {
            job.progress = progress;
        }
    }

    pub async fn set_status(&self, job_id: &str, status: JobStatus, error: Option<String>) {
        let mut jobs = self.jobs.lock().await;
        if let Some(job) = jobs.iter_mut().find(|j| j.id == job_id) {
            job.status = status;
            if let Some(err) = error {
                job.error = Some(err);
            }
        }
    }

    pub async fn move_job(&self, job_id: &str, direction: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().await;
        let idx = jobs.iter().position(|j| j.id == job_id)
            .ok_or_else(|| "Job not found".to_string())?;

        match direction {
            "up" if idx > 0 => {
                jobs.swap(idx, idx - 1);
                Ok(())
            }
            "down" if idx < jobs.len() - 1 => {
                jobs.swap(idx, idx + 1);
                Ok(())
            }
            _ => Err("Cannot move job in that direction".to_string()),
        }
    }
}
