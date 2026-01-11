use crate::models::{Plan, Task, TaskStatus};
use chrono::{NaiveDate, Datelike};

/// Plan을 마크다운 문자열로 변환
pub fn plan_to_markdown(plan: &Plan) -> String {
    let mut md = String::new();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("id: {}\n", plan.id));
    md.push_str(&format!("title: \"{}\"\n", escape_yaml(&plan.title)));
    md.push_str(&format!("status: {}\n", plan.status));
    md.push_str(&format!("priority: {}\n", plan.priority));

    if let Some(ref start) = plan.start_date {
        md.push_str(&format!("start_date: {}\n", start));
    }
    if let Some(ref end) = plan.end_date {
        md.push_str(&format!("end_date: {}\n", end));
    }

    md.push_str(&format!("created_at: {}\n", plan.created_at));
    md.push_str(&format!("updated_at: {}\n", plan.updated_at));
    md.push_str("---\n\n");

    // Title
    md.push_str(&format!("# {}\n\n", plan.title));

    // Description
    if let Some(ref desc) = plan.description {
        if !desc.is_empty() {
            md.push_str(&format!("{}\n\n", desc));
        }
    }

    // Original Input
    if let Some(ref original) = plan.original_input {
        if !original.is_empty() {
            md.push_str("## 원본 입력\n\n");
            md.push_str(&format!("> {}\n\n", original.replace('\n', "\n> ")));
        }
    }

    // Parsed Content
    if let Some(ref parsed) = plan.parsed_content {
        if !parsed.goals.is_empty() {
            md.push_str("## 목표\n\n");
            for goal in &parsed.goals {
                md.push_str(&format!("- {}\n", goal));
            }
            md.push('\n');
        }

        if !parsed.milestones.is_empty() {
            md.push_str("## 마일스톤\n\n");
            for milestone in &parsed.milestones {
                md.push_str(&format!("### {}\n", milestone.title));
                if let Some(ref date) = milestone.target_date {
                    md.push_str(&format!("- 목표일: {}\n", date));
                }
                for task in &milestone.tasks {
                    md.push_str(&format!("- {}\n", task));
                }
                md.push('\n');
            }
        }

        if !parsed.suggested_tasks.is_empty() {
            md.push_str("## 제안 태스크\n\n");
            for task in &parsed.suggested_tasks {
                let duration = task.estimated_duration
                    .map(|d| format!(" ({}분)", d))
                    .unwrap_or_default();
                md.push_str(&format!("- {}{}\n", task.title, duration));
            }
            md.push('\n');
        }
    }

    md
}

/// 일별 태스크들을 마크다운으로 변환
pub fn tasks_to_daily_markdown(date: &str, tasks: &[Task]) -> String {
    let mut md = String::new();

    // 통계 계산
    let total = tasks.len();
    let completed = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Completed)).count();
    let skipped = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Skipped)).count();

    // Frontmatter
    md.push_str("---\n");
    md.push_str(&format!("date: {}\n", date));
    md.push_str(&format!("total: {}\n", total));
    md.push_str(&format!("completed: {}\n", completed));
    md.push_str(&format!("skipped: {}\n", skipped));
    md.push_str("---\n\n");

    // Title (요일 포함)
    let weekday = parse_weekday(date);
    md.push_str(&format!("# {} ({})\n\n", date, weekday));

    // Tasks
    for task in tasks {
        let status_icon = match task.status {
            TaskStatus::Completed => "✅",
            TaskStatus::Skipped => "⏭️",
            TaskStatus::InProgress => "🔄",
            TaskStatus::Pending => "⏳",
        };

        md.push_str(&format!("## {} {}\n\n", status_icon, task.title));

        // Metadata
        md.push_str(&format!("- id: {}\n", task.id));

        if let Some(ref plan_id) = task.plan_id {
            md.push_str(&format!("- plan_id: {}\n", plan_id));
        }

        if let Some(ref time) = task.scheduled_time {
            md.push_str(&format!("- scheduled_time: {}\n", time));
        }

        if let Some(est) = task.estimated_duration {
            md.push_str(&format!("- estimated: {}min\n", est));
        }

        if let Some(actual) = task.actual_duration {
            md.push_str(&format!("- actual: {}min\n", actual));
        }

        md.push_str(&format!("- status: {}\n", task.status));

        if let Some(ref completed_at) = task.completed_at {
            md.push_str(&format!("- completed_at: {}\n", completed_at));
        }

        // Description
        if let Some(ref desc) = task.description {
            if !desc.is_empty() {
                md.push_str(&format!("\n{}\n", desc));
            }
        }

        // Subtasks
        if let Some(ref subtasks) = task.subtasks {
            if !subtasks.is_empty() {
                md.push_str("\n### 서브태스크\n\n");
                for sub in subtasks {
                    let sub_icon = match sub.status {
                        TaskStatus::Completed => "✅",
                        TaskStatus::Skipped => "⏭️",
                        _ => "⬜",
                    };
                    md.push_str(&format!("- {} {}\n", sub_icon, sub.title));
                }
            }
        }

        md.push('\n');
    }

    md
}

/// 전체 데이터를 JSON으로 Export
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub plans: Vec<Plan>,
    pub tasks: Vec<Task>,
}

impl ExportData {
    pub fn new(plans: Vec<Plan>, tasks: Vec<Task>) -> Self {
        Self {
            version: "1.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            plans,
            tasks,
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

// Helper functions

fn escape_yaml(s: &str) -> String {
    s.replace('\"', "\\\"")
}

fn parse_weekday(date_str: &str) -> &'static str {
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        match date.weekday() {
            chrono::Weekday::Mon => "월",
            chrono::Weekday::Tue => "화",
            chrono::Weekday::Wed => "수",
            chrono::Weekday::Thu => "목",
            chrono::Weekday::Fri => "금",
            chrono::Weekday::Sat => "토",
            chrono::Weekday::Sun => "일",
        }
    } else {
        ""
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PlanStatus;

    #[test]
    fn test_plan_to_markdown() {
        let plan = Plan {
            id: "test-id".to_string(),
            title: "테스트 플랜".to_string(),
            description: Some("테스트 설명".to_string()),
            original_input: Some("원본 입력".to_string()),
            parsed_content: None,
            priority: 1,
            start_date: Some("2025-01-01".to_string()),
            end_date: None,
            recurrence: None,
            status: PlanStatus::Active,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
        };

        let md = plan_to_markdown(&plan);
        assert!(md.contains("# 테스트 플랜"));
        assert!(md.contains("id: test-id"));
    }
}
