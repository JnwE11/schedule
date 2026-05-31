/**
 * AI 提取器 — 通过 DeepSeek API 智能提取日程
 * 相比正则匹配，AI 能理解更模糊的表达
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * 使用 DeepSeek API 提取日程
 * @param {string} text - 用户输入的文本
 * @param {string} apiKey - DeepSeek API Key
 * @returns {Promise<{date: Date, text: string}[]>}
 */
async function aiExtractEvents(text, apiKey) {
  if (!apiKey || !apiKey.startsWith('sk-')) {
    throw new Error('API Key 无效，请在设置中配置');
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()];

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个日程提取助手。从用户提供的文字中提取所有日程事件，返回严格的 JSON 格式。

规则：
1. 今天日期是 ${todayStr}（周${dayOfWeek}），以此为基准推算相对日期
2. 每条日程包含 date（ISO 8601 格式如 "2025-01-15T14:00"）和 title（简短事件名）
3. 没有明确时间的，默认设为上午 9:00
4. 没有明确日期的纯时间表达（如"下午3点开会"），默认使用今天；如果时间已过，使用明天
5. "下周X" = 下周的星期X；"本周X" = 本周的星期X；"周X"默认指本周的星期X
6. 不遗漏任何可能的日程，不编造不存在的事件
7. 只返回 JSON 数组，不要任何其他文字`,
        },
        {
          role: 'user',
          content: `请从以下文字中提取所有日程事件：\n\n${text}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('API Key 无效，请检查设置');
    }
    if (response.status === 402) {
      throw new Error('API 额度已用完，请充值或切换回本地模式');
    }
    throw new Error(err.error?.message || `API 请求失败 (${response.status})`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析 JSON 返回
  let parsed;
  try {
    // 尝试直接解析
    parsed = JSON.parse(content);
  } catch {
    // 从内容中提取 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('AI 返回格式异常，请重试');
    }
  }

  // DeepSeek 的 json_object 模式可能返回 {events: [...]}
  const items = Array.isArray(parsed) ? parsed : (parsed.events || parsed.schedule || parsed.items || []);

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('未识别到日程信息，请尝试更具体地描述');
  }

  return items.map(item => {
    const date = new Date(item.date);
    if (isNaN(date.getTime())) {
      // try to parse Chinese date format as fallback
      const fallback = new Date();
      fallback.setHours(9, 0, 0, 0);
      return { date: fallback, text: item.title || String(item) };
    }
    return {
      date,
      text: (item.title || item.text || item.event || item.name || '未命名').slice(0, 40),
    };
  });
}

if (typeof window !== 'undefined') {
  window.aiExtractEvents = aiExtractEvents;
}
