// Prompt templates for LLM operations

export const SYSTEM_PROMPTS = {
  parsePlan: `당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
사용자의 계획을 분석하여 구조화된 JSON으로 변환해주세요.

응답은 반드시 다음 JSON 형식으로만 반환하세요:
{
  "goals": ["목표1", "목표2"],
  "milestones": [
    {
      "title": "마일스톤",
      "targetDate": "YYYY-MM-DD (선택사항)",
      "tasks": ["세부 태스크1", "세부 태스크2"]
    }
  ],
  "suggestedTasks": [
    {
      "title": "일일 태스크",
      "estimatedDuration": 30,
      "priority": 1,
      "frequency": { "type": "daily" }
    }
  ]
}`,

  generateDailyTasks: `오늘 날짜와 사용자의 Plan을 기반으로 적절한 일일 태스크를 생성해주세요.

고려사항:
- 사용자의 현재 진행 상황
- 마감일과의 거리
- 이전 태스크 완료율
- ADHD 친화적인 작은 단위로 분해 (25분 이내 권장)

응답은 반드시 다음 JSON 형식으로만 반환하세요:
{
  "tasks": [
    {
      "title": "태스크 제목",
      "description": "설명 (선택)",
      "estimatedDuration": 25,
      "priority": 1,
      "scheduledTime": "09:00"
    }
  ],
  "summary": "오늘의 개요 (1-2문장)"
}`,

  splitTask: `주어진 태스크를 ADHD 친화적인 작은 단위(5-15분)로 분해해주세요.

원칙:
- 각 서브태스크는 명확하고 구체적으로
- 시작하기 쉬운 작은 첫 단계로 시작
- 완료 기준이 명확해야 함
- 순서대로 진행할 수 있도록

응답은 반드시 다음 JSON 형식으로만 반환하세요:
{
  "subtasks": [
    { "title": "서브태스크 제목", "estimatedMinutes": 10 }
  ]
}`,

  generateNotification: `현재 태스크 상황을 보고 적절한 알림 메시지를 생성해주세요.

ADHD 환자에게 도움이 되도록:
- 부담스럽지 않게
- 구체적으로
- 격려하는 톤으로
- 간결하게 (제목 10자 이내, 본문 30자 이내)

응답은 반드시 다음 JSON 형식으로만 반환하세요:
{
  "title": "알림 제목",
  "body": "알림 본문",
  "urgency": "low" | "medium" | "high"
}`,
};

export function buildParsePlanPrompt(userInput: string): string {
  return `다음 사용자 입력을 분석해주세요:\n\n${userInput}`;
}

export function buildGenerateDailyTasksPrompt(
  plans: { title: string; parsedContent: unknown }[],
  date: string,
  completedTasksToday: number,
  totalTasksToday: number
): string {
  return `오늘 날짜: ${date}
오늘 완료한 태스크: ${completedTasksToday}/${totalTasksToday}

사용자의 계획:
${plans.map((p) => `- ${p.title}: ${JSON.stringify(p.parsedContent)}`).join('\n')}

위 정보를 바탕으로 오늘의 태스크를 생성해주세요.`;
}

export function buildSplitTaskPrompt(
  taskTitle: string,
  taskDescription?: string,
  estimatedDuration?: number
): string {
  let prompt = `분해할 태스크: ${taskTitle}`;
  if (taskDescription) {
    prompt += `\n설명: ${taskDescription}`;
  }
  if (estimatedDuration) {
    prompt += `\n예상 소요 시간: ${estimatedDuration}분`;
  }
  return prompt;
}

export function buildNotificationPrompt(
  taskTitle: string,
  type: 'reminder' | 'start' | 'overdue',
  scheduledTime?: string
): string {
  const typeMessages = {
    reminder: '곧 시작할 예정',
    start: '시작할 시간',
    overdue: '예정 시간이 지남',
  };

  let prompt = `태스크: ${taskTitle}\n상황: ${typeMessages[type]}`;
  if (scheduledTime) {
    prompt += `\n예정 시간: ${scheduledTime}`;
  }
  return prompt;
}
