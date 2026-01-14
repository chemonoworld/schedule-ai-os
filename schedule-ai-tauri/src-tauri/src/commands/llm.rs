use crate::models::{ParsedPlanContent, Plan, SuggestedTask, Task};
use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMContext {
    pub plans: Option<Vec<Plan>>,
    pub recent_tasks: Option<Vec<Task>>,
    pub current_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LLMResponse {
    pub content: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsePlanResponse {
    pub parsed_content: ParsedPlanContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDailyTasksResponse {
    pub tasks: Vec<GeneratedTask>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedTask {
    pub title: String,
    pub description: Option<String>,
    pub estimated_duration: Option<i32>,
    pub priority: i32,
    pub scheduled_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitTaskResponse {
    pub subtasks: Vec<GeneratedSubTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSubTask {
    pub title: String,
    pub estimated_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseTaskResponse {
    pub title: String,
    pub scheduled_date: Option<String>,
    pub scheduled_time: Option<String>,
    pub end_time: Option<String>,
    pub location: Option<String>,
    pub subtasks: Option<Vec<String>>,
    pub priority: Option<i32>,
    pub estimated_duration: Option<i32>,
}

#[tauri::command]
pub async fn process_with_llm(prompt: String, _context: LLMContext) -> Result<LLMResponse> {
    // TODO: Implement actual LLM call
    // For now, return a placeholder response
    Ok(LLMResponse {
        content: format!("Processed: {}", prompt),
        usage: Some(TokenUsage {
            input_tokens: 100,
            output_tokens: 50,
        }),
    })
}

#[tauri::command]
pub async fn parse_plan(input: String) -> Result<ParsePlanResponse> {
    // TODO: Call LLM to parse the plan
    // For now, return a basic parsed structure
    Ok(ParsePlanResponse {
        parsed_content: ParsedPlanContent {
            goals: vec![format!("Goal from: {}", input)],
            milestones: vec![],
            suggested_tasks: vec![SuggestedTask {
                title: "Sample task".to_string(),
                estimated_duration: Some(25),
                priority: 1,
                frequency: None,
            }],
        },
    })
}

#[tauri::command]
pub async fn generate_daily_tasks(
    _plan_ids: Vec<String>,
    date: String,
) -> Result<GenerateDailyTasksResponse> {
    // TODO: Call LLM to generate daily tasks based on plans
    // For now, return sample tasks
    Ok(GenerateDailyTasksResponse {
        tasks: vec![
            GeneratedTask {
                title: "Morning planning".to_string(),
                description: Some("Review today's goals".to_string()),
                estimated_duration: Some(15),
                priority: 2,
                scheduled_time: Some("09:00".to_string()),
            },
            GeneratedTask {
                title: "Focus work block".to_string(),
                description: Some("Deep work session".to_string()),
                estimated_duration: Some(45),
                priority: 3,
                scheduled_time: Some("10:00".to_string()),
            },
        ],
        summary: format!("Generated 2 tasks for {}", date),
    })
}

#[tauri::command]
pub async fn split_task(_task_id: String) -> Result<SplitTaskResponse> {
    // TODO: Call LLM to split task
    // For now, return sample subtasks
    Ok(SplitTaskResponse {
        subtasks: vec![
            GeneratedSubTask {
                title: "Step 1: Prepare".to_string(),
                estimated_minutes: 5,
            },
            GeneratedSubTask {
                title: "Step 2: Execute".to_string(),
                estimated_minutes: 15,
            },
            GeneratedSubTask {
                title: "Step 3: Review".to_string(),
                estimated_minutes: 5,
            },
        ],
    })
}
