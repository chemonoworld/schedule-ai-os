use crate::models::{Plan, Task, PlanStatus, TaskStatus};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Frontmatter를 파싱하여 key-value 맵으로 반환
pub fn parse_frontmatter(content: &str) -> Option<(HashMap<String, String>, String)> {
    let content = content.trim();

    if !content.starts_with("---") {
        return None;
    }

    let rest = &content[3..];
    let end_pos = rest.find("---")?;

    let frontmatter_str = &rest[..end_pos].trim();
    let body = rest[end_pos + 3..].trim();

    let mut map = HashMap::new();
    for line in frontmatter_str.lines() {
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_string();
            let value = value.trim().trim_matches('"').to_string();
            map.insert(key, value);
        }
    }

    Some((map, body.to_string()))
}

/// 마크다운에서 Plan 파싱
pub fn markdown_to_plan(content: &str) -> Result<Plan, ParseError> {
    let (frontmatter, _body) = parse_frontmatter(content)
        .ok_or(ParseError::NoFrontmatter)?;

    let id = frontmatter.get("id")
        .ok_or(ParseError::MissingField("id"))?
        .clone();

    let title = frontmatter.get("title")
        .ok_or(ParseError::MissingField("title"))?
        .clone();

    let status = frontmatter.get("status")
        .map(|s| parse_plan_status(s))
        .unwrap_or(PlanStatus::Active);

    let priority = frontmatter.get("priority")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    Ok(Plan {
        id,
        title,
        description: frontmatter.get("description").cloned(),
        original_input: None,
        parsed_content: None,
        priority,
        start_date: frontmatter.get("start_date").cloned(),
        end_date: frontmatter.get("end_date").cloned(),
        recurrence: None,
        status,
        created_at: frontmatter.get("created_at")
            .cloned()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        updated_at: frontmatter.get("updated_at")
            .cloned()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    })
}

/// 마크다운에서 일별 Tasks 파싱
pub fn markdown_to_tasks(content: &str) -> Result<Vec<Task>, ParseError> {
    let (frontmatter, body) = parse_frontmatter(content)
        .ok_or(ParseError::NoFrontmatter)?;

    let date = frontmatter.get("date")
        .ok_or(ParseError::MissingField("date"))?
        .clone();

    let mut tasks = Vec::new();
    let mut current_task: Option<TaskBuilder> = None;

    for line in body.lines() {
        let line = line.trim();

        // ## 으로 시작하면 새 태스크
        if line.starts_with("## ") {
            // 이전 태스크 저장
            if let Some(builder) = current_task.take() {
                if let Ok(task) = builder.build(&date) {
                    tasks.push(task);
                }
            }

            // 새 태스크 시작
            let title_part = &line[3..];
            let (status, title) = parse_task_title(title_part);
            current_task = Some(TaskBuilder::new(title, status));
        }
        // 메타데이터 라인
        else if line.starts_with("- ") && current_task.is_some() {
            let meta_line = &line[2..];
            if let Some((key, value)) = meta_line.split_once(':') {
                let key = key.trim();
                let value = value.trim();

                if let Some(ref mut builder) = current_task {
                    match key {
                        "id" => builder.id = Some(value.to_string()),
                        "plan_id" => builder.plan_id = Some(value.to_string()),
                        "scheduled_time" => builder.scheduled_time = Some(value.to_string()),
                        "estimated" => builder.estimated_duration = parse_duration(value),
                        "actual" => builder.actual_duration = parse_duration(value),
                        "completed_at" => builder.completed_at = Some(value.to_string()),
                        _ => {}
                    }
                }
            }
        }
    }

    // 마지막 태스크 저장
    if let Some(builder) = current_task.take() {
        if let Ok(task) = builder.build(&date) {
            tasks.push(task);
        }
    }

    Ok(tasks)
}

/// JSON에서 전체 데이터 Import
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportData {
    pub version: Option<String>,
    pub plans: Vec<Plan>,
    pub tasks: Vec<Task>,
}

impl ImportData {
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json_str)
    }
}

// Helper types

#[derive(Debug)]
pub enum ParseError {
    NoFrontmatter,
    MissingField(&'static str),
    InvalidFormat(String),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::NoFrontmatter => write!(f, "No frontmatter found"),
            ParseError::MissingField(field) => write!(f, "Missing required field: {}", field),
            ParseError::InvalidFormat(msg) => write!(f, "Invalid format: {}", msg),
        }
    }
}

struct TaskBuilder {
    id: Option<String>,
    title: String,
    status: TaskStatus,
    plan_id: Option<String>,
    scheduled_time: Option<String>,
    estimated_duration: Option<i32>,
    actual_duration: Option<i32>,
    completed_at: Option<String>,
}

impl TaskBuilder {
    fn new(title: String, status: TaskStatus) -> Self {
        Self {
            id: None,
            title,
            status,
            plan_id: None,
            scheduled_time: None,
            estimated_duration: None,
            actual_duration: None,
            completed_at: None,
        }
    }

    fn build(self, date: &str) -> Result<Task, ParseError> {
        let now = chrono::Utc::now().to_rfc3339();
        Ok(Task {
            id: self.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            plan_id: self.plan_id,
            title: self.title,
            description: None,
            location: None,
            scheduled_date: date.to_string(),
            scheduled_time: self.scheduled_time,
            estimated_duration: self.estimated_duration,
            actual_duration: self.actual_duration,
            priority: 0,
            status: self.status,
            order_index: 0,
            subtasks: None,
            created_at: now.clone(),
            updated_at: now,
            completed_at: self.completed_at,
        })
    }
}

fn parse_plan_status(s: &str) -> PlanStatus {
    match s.to_lowercase().as_str() {
        "active" => PlanStatus::Active,
        "paused" => PlanStatus::Paused,
        "completed" => PlanStatus::Completed,
        "archived" => PlanStatus::Archived,
        _ => PlanStatus::Active,
    }
}

fn parse_task_status(s: &str) -> TaskStatus {
    match s.to_lowercase().as_str() {
        "pending" => TaskStatus::Pending,
        "in_progress" => TaskStatus::InProgress,
        "completed" => TaskStatus::Completed,
        "skipped" => TaskStatus::Skipped,
        _ => TaskStatus::Pending,
    }
}

fn parse_task_title(title_part: &str) -> (TaskStatus, String) {
    let title_part = title_part.trim();

    // 이모지로 상태 판단
    if title_part.starts_with("✅") {
        (TaskStatus::Completed, title_part[4..].trim().to_string())
    } else if title_part.starts_with("⏭️") {
        (TaskStatus::Skipped, title_part[7..].trim().to_string())
    } else if title_part.starts_with("🔄") {
        (TaskStatus::InProgress, title_part[4..].trim().to_string())
    } else if title_part.starts_with("⏳") {
        (TaskStatus::Pending, title_part[4..].trim().to_string())
    } else {
        (TaskStatus::Pending, title_part.to_string())
    }
}

fn parse_duration(s: &str) -> Option<i32> {
    // "30min" or "30" 형식 처리
    let s = s.trim().trim_end_matches("min");
    s.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_frontmatter() {
        let content = r#"---
id: test-123
title: "테스트"
status: active
---

# 본문
"#;

        let (fm, body) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.get("id").unwrap(), "test-123");
        assert_eq!(fm.get("title").unwrap(), "테스트");
        assert!(body.contains("# 본문"));
    }

    #[test]
    fn test_parse_task_title() {
        let (status, title) = parse_task_title("✅ 완료된 태스크");
        assert!(matches!(status, TaskStatus::Completed));
        assert_eq!(title, "완료된 태스크");
    }
}
