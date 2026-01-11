use crate::models::{Task, TaskStatus};
use chrono::Datelike;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyProgress {
    pub date: String,
    pub total_tasks: i32,
    pub completed_tasks: i32,
    pub skipped_tasks: i32,
    pub total_estimated_minutes: i32,
    pub total_actual_minutes: i32,
    pub completion_rate: f64,
    pub streak_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapData {
    pub date: String,
    pub level: u8,           // 0=none, 1=low, 2=medium, 3=high, 4=max
    pub completion_rate: f64,
    pub task_count: i32,
}

/// Calculate daily progress from tasks
pub fn calculate_daily_progress(date: &str, tasks: &[Task]) -> DailyProgress {
    let total = tasks.len() as i32;
    let completed = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Completed)).count() as i32;
    let skipped = tasks.iter().filter(|t| matches!(t.status, TaskStatus::Skipped)).count() as i32;

    let total_estimated: i32 = tasks
        .iter()
        .filter_map(|t| t.estimated_duration)
        .sum();

    let total_actual: i32 = tasks
        .iter()
        .filter_map(|t| t.actual_duration)
        .sum();

    // Completion rate: completed / (total - skipped)
    let denominator = total - skipped;
    let completion_rate = if denominator > 0 {
        completed as f64 / denominator as f64
    } else {
        0.0
    };

    DailyProgress {
        date: date.to_string(),
        total_tasks: total,
        completed_tasks: completed,
        skipped_tasks: skipped,
        total_estimated_minutes: total_estimated,
        total_actual_minutes: total_actual,
        completion_rate,
        streak_count: 0, // Calculated separately
    }
}

/// Get heatmap level (0-4) from completion rate
pub fn get_heatmap_level(completion_rate: f64) -> u8 {
    match completion_rate {
        r if r >= 0.75 => 4,  // 75-100%
        r if r >= 0.50 => 3,  // 50-74%
        r if r >= 0.25 => 2,  // 25-49%
        r if r > 0.0 => 1,    // 1-24%
        _ => 0,               // 0%
    }
}

/// Convert DailyProgress to HeatmapData
pub fn progress_to_heatmap(progress: &DailyProgress) -> HeatmapData {
    HeatmapData {
        date: progress.date.clone(),
        level: get_heatmap_level(progress.completion_rate),
        completion_rate: progress.completion_rate,
        task_count: progress.total_tasks,
    }
}

/// Calculate streak from a sorted (descending by date) list of progress entries
/// Returns the current streak count
///
/// 로직:
/// - 오늘부터 과거로 탐색
/// - 50% 이상 완료한 날은 스트릭에 포함
/// - 스트릭이 시작된 후 50% 미만이거나 데이터 없으면 스트릭 종료
pub fn calculate_streak(progress_history: &[DailyProgress], today: &str) -> i32 {
    let mut streak = 0;
    let mut streak_started = false;

    // Parse today's date
    let today_date = match chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return 0,
    };

    // Check each day going backwards from today
    for day_offset in 0i64..365 {
        let check_date = today_date - chrono::Duration::days(day_offset);
        let date_str = check_date.format("%Y-%m-%d").to_string();

        // Find progress for this date
        if let Some(p) = progress_history.iter().find(|p| p.date == date_str) {
            // At least 50% completion to count toward streak
            if p.completion_rate >= 0.5 {
                streak += 1;
                streak_started = true;
            } else if streak_started {
                // 스트릭이 시작된 후 50% 미만이면 종료
                break;
            }
            // 스트릭이 아직 시작 안됐고 50% 미만이면 계속 과거 탐색
        } else {
            // No record for this day
            if streak_started {
                // 스트릭이 시작된 후 빈 날이 있으면 종료
                break;
            }
            // 스트릭이 아직 시작 안됐으면 계속 과거 탐색
        }
    }

    streak
}

/// Generate heatmap data for a year
/// Grid is 7 rows (Sun-Sat) x ~53 columns (weeks)
/// We add empty placeholder cells at the start to align the first day to correct weekday
pub fn generate_yearly_heatmap(year: i32, progress_data: &[DailyProgress]) -> Vec<HeatmapData> {
    let start_date = chrono::NaiveDate::from_ymd_opt(year, 1, 1).unwrap();
    let end_date = chrono::NaiveDate::from_ymd_opt(year, 12, 31).unwrap();

    let mut result = Vec::new();

    // Add empty placeholder cells for days before Jan 1st in the first week
    // weekday(): Mon=0, Tue=1, ..., Sun=6
    // We want grid to start on Sunday (row 0), so convert: Sun=0, Mon=1, ..., Sat=6
    let start_weekday = start_date.weekday().num_days_from_sunday() as usize;

    // Add placeholder cells (empty) for alignment
    for _ in 0..start_weekday {
        result.push(HeatmapData {
            date: String::new(), // Empty date indicates placeholder
            level: 0,
            completion_rate: 0.0,
            task_count: -1, // -1 indicates placeholder cell
        });
    }

    let mut current = start_date;
    while current <= end_date {
        let date_str = current.format("%Y-%m-%d").to_string();

        let heatmap = if let Some(p) = progress_data.iter().find(|p| p.date == date_str) {
            progress_to_heatmap(p)
        } else {
            HeatmapData {
                date: date_str,
                level: 0,
                completion_rate: 0.0,
                task_count: 0,
            }
        };

        result.push(heatmap);
        current += chrono::Duration::days(1);
    }

    result
}
