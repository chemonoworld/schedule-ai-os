use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub original_input: Option<String>,
    pub parsed_content: Option<ParsedPlanContent>,
    pub priority: i32,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub recurrence: Option<RecurrencePattern>,
    pub status: PlanStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub plan_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub scheduled_date: String,
    pub scheduled_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub actual_duration: Option<i32>,
    pub priority: i32,
    pub status: TaskStatus,
    pub order_index: i32,
    pub subtasks: Option<Vec<SubTask>>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubTask {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub order_index: i32,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreTime {
    pub id: String,
    pub name: String,
    pub start_time: String,
    pub end_time: String,
    pub days_of_week: Vec<i32>,
    pub blocked_apps: Option<Vec<String>>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlanStatus {
    Active,
    Paused,
    Completed,
    Archived,
}

impl Default for PlanStatus {
    fn default() -> Self {
        PlanStatus::Active
    }
}

impl std::fmt::Display for PlanStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlanStatus::Active => write!(f, "active"),
            PlanStatus::Paused => write!(f, "paused"),
            PlanStatus::Completed => write!(f, "completed"),
            PlanStatus::Archived => write!(f, "archived"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Skipped,
}

impl Default for TaskStatus {
    fn default() -> Self {
        TaskStatus::Pending
    }
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Skipped => write!(f, "skipped"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrencePattern {
    #[serde(rename = "type")]
    pub recurrence_type: RecurrenceType,
    pub interval: i32,
    pub days_of_week: Option<Vec<i32>>,
    pub day_of_month: Option<i32>,
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecurrenceType {
    Daily,
    Weekly,
    Monthly,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPlanContent {
    pub goals: Vec<String>,
    pub milestones: Vec<Milestone>,
    pub suggested_tasks: Vec<SuggestedTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub title: String,
    pub target_date: Option<String>,
    pub tasks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedTask {
    pub title: String,
    pub estimated_duration: Option<i32>,
    pub priority: i32,
    pub frequency: Option<RecurrencePattern>,
}

// Input types for commands
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlanInput {
    pub title: String,
    pub description: Option<String>,
    pub original_input: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlanInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<i32>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<PlanStatus>,
    pub parsed_content: Option<ParsedPlanContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub plan_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub scheduled_date: String,
    pub scheduled_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub scheduled_date: Option<String>,
    pub scheduled_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub actual_duration: Option<i32>,
    pub priority: Option<i32>,
    pub status: Option<TaskStatus>,
    pub order_index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubTaskInput {
    pub task_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSubTaskInput {
    pub title: Option<String>,
    pub status: Option<TaskStatus>,
    pub order_index: Option<i32>,
}

// Utility functions
pub fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
