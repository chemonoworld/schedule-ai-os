use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringPlan {
    pub id: String,
    pub plan_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub recurrence_type: RecurrenceType,
    pub interval_value: i32,
    pub days_of_week: Option<Vec<i32>>, // 0=일, 1=월, ..., 6=토
    pub day_of_month: Option<i32>,
    pub scheduled_time: Option<String>,
    pub end_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub start_date: String,
    pub end_date: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RecurrenceType {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRecurringPlanInput {
    pub plan_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub recurrence_type: RecurrenceType,
    pub interval_value: Option<i32>,
    pub days_of_week: Option<Vec<i32>>,
    pub day_of_month: Option<i32>,
    pub scheduled_time: Option<String>,
    pub end_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub start_date: String,
    pub end_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedTaskInput {
    pub plan_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub scheduled_date: String,
    pub scheduled_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedRecurrencePattern {
    pub recurrence_type: RecurrenceType,
    pub interval_value: i32,
    pub days_of_week: Option<Vec<i32>>,
    pub day_of_month: Option<i32>,
    pub scheduled_time: Option<String>,
    pub end_time: Option<String>,
    pub estimated_duration: Option<i32>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub title: Option<String>,
    pub location: Option<String>,
}

impl Default for ParsedRecurrencePattern {
    fn default() -> Self {
        Self {
            recurrence_type: RecurrenceType::Weekly,
            interval_value: 1,
            days_of_week: None,
            day_of_month: None,
            scheduled_time: None,
            end_time: None,
            estimated_duration: None,
            start_date: None,
            end_date: None,
            title: None,
            location: None,
        }
    }
}

/// 자연어에서 반복 패턴 파싱 (규칙 기반)
pub fn parse_recurrence_pattern(input: &str) -> Option<ParsedRecurrencePattern> {
    let input_lower = input.to_lowercase();
    let input_lower = input_lower.as_str();

    let mut pattern = ParsedRecurrencePattern {
        recurrence_type: RecurrenceType::Weekly,
        interval_value: 1,
        days_of_week: None,
        day_of_month: None,
        scheduled_time: None,
        end_time: None,
        estimated_duration: None,
        start_date: None,
        end_date: None,
        title: None,
        location: None,
    };

    // 반복 유형 파싱
    if input_lower.contains("매일") || input_lower.contains("daily") {
        pattern.recurrence_type = RecurrenceType::Daily;
        pattern.interval_value = 1;
    } else if input_lower.contains("격주") {
        pattern.recurrence_type = RecurrenceType::Weekly;
        pattern.interval_value = 2;
    } else if input_lower.contains("매주") || input_lower.contains("weekly") {
        pattern.recurrence_type = RecurrenceType::Weekly;
        pattern.interval_value = 1;
    } else if input_lower.contains("매월") || input_lower.contains("monthly") {
        pattern.recurrence_type = RecurrenceType::Monthly;
        pattern.interval_value = 1;
    }

    // 요일 파싱
    let mut days = Vec::new();
    if input_lower.contains("일요일") || input_lower.contains("sunday") {
        days.push(0);
    }
    if input_lower.contains("월요일") || input_lower.contains("monday") || input_lower.contains("월") && !input_lower.contains("매월") {
        days.push(1);
    }
    if input_lower.contains("화요일") || input_lower.contains("tuesday") || input_lower.contains("화") {
        days.push(2);
    }
    if input_lower.contains("수요일") || input_lower.contains("wednesday") || input_lower.contains("수") {
        days.push(3);
    }
    if input_lower.contains("목요일") || input_lower.contains("thursday") || input_lower.contains("목") {
        days.push(4);
    }
    if input_lower.contains("금요일") || input_lower.contains("friday") || input_lower.contains("금") {
        days.push(5);
    }
    if input_lower.contains("토요일") || input_lower.contains("saturday") || input_lower.contains("토") {
        days.push(6);
    }

    // 특수 패턴
    if input_lower.contains("평일") || input_lower.contains("weekday") {
        days = vec![1, 2, 3, 4, 5];
    }
    if input_lower.contains("주말") || input_lower.contains("weekend") {
        days = vec![0, 6];
    }
    if input_lower.contains("월수금") {
        days = vec![1, 3, 5];
    }
    if input_lower.contains("화목") {
        days = vec![2, 4];
    }

    if !days.is_empty() {
        pattern.days_of_week = Some(days);
    }

    // 시간 파싱 (12-16시, 12시-16시, 오후 3시 등)
    if let Some((start, end)) = parse_time_range(input) {
        pattern.scheduled_time = Some(start.clone());
        pattern.end_time = Some(end.clone());
        // 시간 차이로 duration 계산
        if let (Some(start_mins), Some(end_mins)) = (time_to_minutes(&start), time_to_minutes(&end)) {
            if end_mins > start_mins {
                pattern.estimated_duration = Some(end_mins - start_mins);
            }
        }
    } else if let Some(time) = parse_single_time(input) {
        pattern.scheduled_time = Some(time);
    }

    // 기간 파싱 (1월부터 2월까지, 2026년 1월부터 등)
    if let Some((start, end)) = parse_date_range(input) {
        pattern.start_date = Some(start);
        pattern.end_date = end;
    }

    // 제목 추출 (마지막 줄 또는 반복 패턴 이후 텍스트)
    let title = extract_title(input);
    if !title.is_empty() {
        pattern.title = Some(title);
    }

    Some(pattern)
}

/// 시간 범위 파싱 (12-16시, 12시~16시 등)
fn parse_time_range(input: &str) -> Option<(String, String)> {
    // 패턴: "12-16시", "12시-16시", "12:00-16:00"
    let _re_patterns = [
        r"(\d{1,2})[-~](\d{1,2})시",
        r"(\d{1,2})시[-~](\d{1,2})시",
        r"(\d{1,2}):(\d{2})[-~](\d{1,2}):(\d{2})",
    ];

    // 간단한 패턴 매칭
    for i in 0..input.len() {
        let slice = &input[i..];

        // "12-16시" 패턴
        if let Some(end_idx) = slice.find("시") {
            let before_si = &slice[..end_idx];
            if let Some(dash_idx) = before_si.find('-').or_else(|| before_si.find('~')) {
                let start_str = before_si[..dash_idx].trim();
                let end_str = before_si[dash_idx + 1..].trim();

                if let (Ok(start_hour), Ok(end_hour)) = (start_str.parse::<i32>(), end_str.parse::<i32>()) {
                    if start_hour >= 0 && start_hour < 24 && end_hour >= 0 && end_hour < 24 {
                        return Some((
                            format!("{:02}:00", start_hour),
                            format!("{:02}:00", end_hour),
                        ));
                    }
                }
            }
        }
    }

    None
}

/// 단일 시간 파싱
fn parse_single_time(input: &str) -> Option<String> {
    // "오후 3시", "15시", "3시" 등
    let input_lower = input.to_lowercase();

    // 오후/오전 처리
    let is_pm = input_lower.contains("오후") || input_lower.contains("pm");
    let is_am = input_lower.contains("오전") || input_lower.contains("am");

    // 시간 숫자 찾기
    for i in 0..input.len() {
        let slice = &input[i..];
        if let Some(si_idx) = slice.find("시") {
            let before = &slice[..si_idx];
            // 뒤에서부터 숫자 찾기
            let num_str: String = before.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<String>().chars().rev().collect();
            if let Ok(mut hour) = num_str.parse::<i32>() {
                if is_pm && hour < 12 {
                    hour += 12;
                } else if is_am && hour == 12 {
                    hour = 0;
                }
                if hour >= 0 && hour < 24 {
                    return Some(format!("{:02}:00", hour));
                }
            }
        }
    }

    None
}

/// 시간을 분으로 변환
fn time_to_minutes(time: &str) -> Option<i32> {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 2 {
        if let (Ok(h), Ok(m)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
            return Some(h * 60 + m);
        }
    }
    None
}

/// 날짜 범위 파싱
fn parse_date_range(input: &str) -> Option<(String, Option<String>)> {
    let current_year = chrono::Local::now().year();
    let next_year = current_year + 1;

    // "2026년 1월부터 2월까지" 패턴
    // "1월부터 2월까지" 패턴
    // "다음주부터" 패턴

    let mut start_month: Option<i32> = None;
    let mut end_month: Option<i32> = None;
    let mut year = next_year; // 기본값으로 다음 연도 사용

    // 연도 파싱
    if let Some(year_idx) = input.find("년") {
        let before_year = &input[..year_idx];
        let year_str: String = before_year.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<String>().chars().rev().collect();
        if let Ok(parsed_year) = year_str.parse::<i32>() {
            year = parsed_year;
        }
    }

    // 월 파싱
    let months = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
    for (i, month_str) in months.iter().enumerate() {
        if input.contains(month_str) {
            if start_month.is_none() {
                start_month = Some((i + 1) as i32);
            } else {
                end_month = Some((i + 1) as i32);
            }
        }
    }

    if let Some(start_m) = start_month {
        let start_date = format!("{}-{:02}-01", year, start_m);
        let end_date = end_month.map(|end_m| {
            // 해당 월의 마지막 날짜 계산
            let next_month = if end_m == 12 { 1 } else { end_m + 1 };
            let next_year = if end_m == 12 { year + 1 } else { year };
            let last_day = NaiveDate::from_ymd_opt(next_year, next_month as u32, 1)
                .and_then(|d| d.checked_sub_signed(Duration::days(1)))
                .map(|d| d.day())
                .unwrap_or(28);
            format!("{}-{:02}-{:02}", year, end_m, last_day)
        });
        return Some((start_date, end_date));
    }

    None
}

/// 제목 추출
fn extract_title(input: &str) -> String {
    // 줄바꿈으로 분리된 경우 마지막 줄
    let lines: Vec<&str> = input.lines().collect();
    if lines.len() > 1 {
        return lines.last().unwrap_or(&"").trim().to_string();
    }

    // 반복 패턴 키워드 이후 텍스트
    let keywords = ["매일", "매주", "격주", "매월", "시까지", "시에"];
    let mut last_keyword_end = 0;

    for keyword in keywords {
        if let Some(idx) = input.find(keyword) {
            let end = idx + keyword.len();
            if end > last_keyword_end {
                last_keyword_end = end;
            }
        }
    }

    if last_keyword_end > 0 && last_keyword_end < input.len() {
        let remaining = input[last_keyword_end..].trim();
        // 시간 패턴 제거
        let remaining = remaining.trim_start_matches(|c: char| c.is_ascii_digit() || c == ':' || c == '-' || c == '~');
        return remaining.trim().to_string();
    }

    String::new()
}

/// RecurringPlan에서 태스크 목록 생성
pub fn generate_tasks_from_recurring_plan(plan: &RecurringPlan) -> Vec<GeneratedTaskInput> {
    let mut tasks = Vec::new();

    let start_date = match NaiveDate::parse_from_str(&plan.start_date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return tasks,
    };

    // 종료일이 없으면 1년 후까지
    let end_date = plan.end_date.as_ref()
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .unwrap_or_else(|| start_date + Duration::days(365));

    let mut current_date = start_date;

    while current_date <= end_date {
        if should_generate_on_date(plan, current_date) {
            tasks.push(GeneratedTaskInput {
                plan_id: plan.plan_id.clone(),
                title: plan.title.clone(),
                description: plan.description.clone(),
                scheduled_date: current_date.format("%Y-%m-%d").to_string(),
                scheduled_time: plan.scheduled_time.clone(),
                estimated_duration: plan.estimated_duration,
                priority: 0,
            });
        }

        current_date = match plan.recurrence_type {
            RecurrenceType::Daily => current_date + Duration::days(plan.interval_value as i64),
            RecurrenceType::Weekly => {
                // 주간 반복: 다음 날로 이동 (요일 체크는 should_generate_on_date에서)
                current_date + Duration::days(1)
            },
            RecurrenceType::Monthly => {
                // 월간 반복: 다음 달 같은 날
                let year = current_date.year();
                let month = current_date.month();
                let day = plan.day_of_month.unwrap_or(current_date.day() as i32) as u32;

                let (next_year, next_month) = if month == 12 {
                    (year + plan.interval_value, 1)
                } else {
                    (year, month + plan.interval_value as u32)
                };

                NaiveDate::from_ymd_opt(next_year, next_month, day.min(28))
                    .unwrap_or(current_date + Duration::days(30))
            }
        };
    }

    tasks
}

/// 해당 날짜에 태스크를 생성해야 하는지 확인
fn should_generate_on_date(plan: &RecurringPlan, date: NaiveDate) -> bool {
    match plan.recurrence_type {
        RecurrenceType::Daily => true,
        RecurrenceType::Weekly => {
            if let Some(ref days) = plan.days_of_week {
                let weekday = date.weekday().num_days_from_sunday() as i32;
                days.contains(&weekday)
            } else {
                true // 요일 지정 없으면 매일
            }
        }
        RecurrenceType::Monthly => {
            if let Some(day_of_month) = plan.day_of_month {
                date.day() == day_of_month as u32
            } else {
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_weekly_pattern() {
        let result = parse_recurrence_pattern("매주 토요일 12-16시 토플 학원").unwrap();
        assert_eq!(result.recurrence_type, RecurrenceType::Weekly);
        assert_eq!(result.days_of_week, Some(vec![6]));
        assert_eq!(result.scheduled_time, Some("12:00".to_string()));
        assert_eq!(result.end_time, Some("16:00".to_string()));
        assert_eq!(result.estimated_duration, Some(240));
    }

    #[test]
    fn test_parse_date_range() {
        let result = parse_recurrence_pattern("2026년 1월부터 2월까지 매주 토요일").unwrap();
        assert_eq!(result.start_date, Some("2026-01-01".to_string()));
        assert_eq!(result.end_date, Some("2026-02-28".to_string()));
    }

    #[test]
    fn test_parse_weekday_pattern() {
        let result = parse_recurrence_pattern("평일 9시 출근").unwrap();
        assert_eq!(result.days_of_week, Some(vec![1, 2, 3, 4, 5]));
    }
}
