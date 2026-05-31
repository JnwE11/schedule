/**
 * 智能日期提取器
 * 从中文自然语言中识别日期 + 时间 + 事件描述
 * 支持：绝对日期、相对日期、时间段、重复事件关键词
 */

// ── 工具函数 ──
function todayAt(h = 0, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayOfWeek(targetDayName) {
  // targetDayName: 日/一/二/三/四/五/六/天/周日/周一.../星期天...
  const map = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const key = targetDayName.replace(/[周星期]/g, '');
  return map[key];
}

function nextDayOfWeek(targetDow) {
  const today = new Date();
  const current = today.getDay();
  let diff = targetDow - current;
  if (diff <= 0) diff += 7; // 下个星期
  return addDays(today, diff);
}

function thisDayOfWeek(targetDow) {
  const today = new Date();
  const current = today.getDay();
  let diff = targetDow - current;
  if (diff < 0) diff += 7;
  return addDays(today, diff);
}

/**
 * 解析时间字符串 → { hour, minute }
 * 支持：下午3点、上午10:30、晚上8点、中午12点、凌晨2点、14:30、3点半、三点一刻
 */
function parseTime(timeStr) {
  if (!timeStr) return { hour: 0, minute: 0 };
  let hour = 0, minute = 0;

  // 处理时分格式：14:30, 2:30
  const hhmm = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) {
    hour = parseInt(hhmm[1]);
    minute = parseInt(hhmm[2]);
    return { hour: Math.min(hour, 23), minute: Math.min(minute, 59) };
  }

  // 提取数字
  const numMatch = timeStr.match(/(\d{1,2})/);
  const num = numMatch ? parseInt(numMatch[1]) : 0;

  // 时段偏移
  if (/凌晨/.test(timeStr)) {
    hour = (num === 0) ? 0 : num;
  } else if (/早上|早晨|上午|早/.test(timeStr)) {
    hour = (num === 0) ? 9 : num;
  } else if (/中午|正午/.test(timeStr)) {
    hour = (num === 0) ? 12 : num;
  } else if (/下午|午后/.test(timeStr)) {
    if (num === 12) hour = 12;
    else hour = (num === 0) ? 14 : num + 12;
  } else if (/晚上|傍晚|晚间/.test(timeStr)) {
    if (num >= 12) hour = num;
    else hour = (num === 0) ? 20 : num + 12;
  } else if (/深夜|半夜/.test(timeStr)) {
    hour = (num === 0) ? 23 : num;
  } else {
    hour = num;
  }

  // 半小时、一刻、三刻
  if (/半/.test(timeStr)) minute = 30;
  else if (/一刻/.test(timeStr)) minute = 15;
  else if (/三刻/.test(timeStr)) minute = 45;
  else if (/二刻/.test(timeStr)) minute = 30;

  return { hour: Math.min(hour, 23), minute: Math.min(minute, 59) };
}

/**
 * 核心提取函数
 * 输入：一段文本
 * 输出：{ date: Date, text: "事件描述" }[]
 */
function extractEvents(text) {
  if (!text || !text.trim()) return [];
  const events = [];

  // ── 日期匹配模式（按优先级排序）──
  const patterns = [

    // 1. 绝对日期 + 时间：2025年1月15日下午3点 / 1月15日 14:30
    {
      regex: /(\d{4})\s*[年\-/]\s*(\d{1,2})\s*[月\-/]\s*(\d{1,2})\s*[日号]?\s*[，,]*\s*([^\d，,。！？\n]{0,20}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)/g,
      build(m) {
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
          parseTime(m[4]).hour, parseTime(m[4]).minute);
      }
    },
    // 1b. 绝对日期不带时间：2025年1月15日
    {
      regex: /(\d{4})\s*[年\-/]\s*(\d{1,2})\s*[月\-/]\s*(\d{1,2})\s*[日号]?/g,
      build(m) {
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 9, 0);
      }
    },

    // 2. 月日 + 时间：3月15日下午2:30 / 3-15 上午10点
    {
      regex: /(\d{1,2})\s*[月\-/]\s*(\d{1,2})\s*[日号]?\s*[，,]*\s*([^\d，,。！？\n]{0,20}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)/g,
      build(m) {
        const now = new Date();
        const month = parseInt(m[1]) - 1;
        const day = parseInt(m[2]);
        let year = now.getFullYear();
        // 如果该月日已过，延至明年
        const candidate = new Date(year, month, day);
        if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          year++;
        }
        const time = parseTime(m[3]);
        return new Date(year, month, day, time.hour, time.minute);
      }
    },
    // 2b. 月日不带时间
    {
      regex: /(\d{1,2})\s*[月\-/]\s*(\d{1,2})\s*[日号]?/g,
      build(m) {
        const now = new Date();
        const month = parseInt(m[1]) - 1;
        const day = parseInt(m[2]);
        let year = now.getFullYear();
        const candidate = new Date(year, month, day);
        if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          year++;
        }
        return new Date(year, month, day, 9, 0);
      }
    },

    // 3. 下周X + 时间：下周三下午3点
    {
      regex: /(下[个]?周)([一二三四五六日天])\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const dow = dayOfWeek(m[2]);
        const d = nextDayOfWeek(dow);
        const time = m[3] ? parseTime(m[3]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },
    // 3b. 下周X不带时间
    {
      regex: /(下[个]?周)([一二三四五六日天])/g,
      build(m) {
        const dow = dayOfWeek(m[2]);
        const d = nextDayOfWeek(dow);
        d.setHours(9, 0);
        return d;
      }
    },

    // 4. 本周X + 时间：本周五下午2点
    {
      regex: /(本[个]?周|这[个]?周)([一二三四五六日天])\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const dow = dayOfWeek(m[2]);
        const d = thisDayOfWeek(dow);
        const time = m[3] ? parseTime(m[3]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 5. 周X + 时间：周一上午10点
    {
      regex: /(周|星期)([一二三四五六日天])\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const dow = dayOfWeek(m[2]);
        const d = thisDayOfWeek(dow);
        const time = m[3] ? parseTime(m[3]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 6. 明天 + 时间：明天下午3点 / 明天上午
    {
      regex: /(明天|明日)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), 1);
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 7. 后天 + 时间
    {
      regex: /(后天|後天|後日)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), 2);
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 8. 大后天
    {
      regex: /(大后天)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), 3);
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 9. 大前天
    {
      regex: /(大前天)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), -3);
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 10. 前天
    {
      regex: /(前天|前日)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), -2);
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 11. 昨天
    {
      regex: /(昨天|昨日)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), -1);
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 12. 今天 + 时间
    {
      regex: /(今天|今日)\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const time = m[2] ? parseTime(m[2]) : { hour: new Date().getHours() + 1, minute: 0 };
        return todayAt(time.hour, time.minute);
      }
    },

    // 13. N天后 / N天后 + 时间
    {
      regex: /(\d{1,2})\s*天[之以]?后\s*[，,]*\s*([^\d，,。！？\n]{0,15}?(?:上午|下午|晚上|中午|凌晨|早上)[^\d，,。！？\n]{0,10}?)?/g,
      build(m) {
        const d = addDays(new Date(), parseInt(m[1]));
        const time = m[2] ? parseTime(m[2]) : { hour: 9, minute: 0 };
        d.setHours(time.hour, time.minute);
        return d;
      }
    },

    // 14. 纯时间（无日期）：下午3点、晚上8点 → 默认为今天
    {
      regex: /(?:^|[\s，,。！？\n])((?:上午|下午|晚上|中午|凌晨|早上|早晨)\s*\d{1,2}\s*[点:：]\s*(?:\d{1,2}\s*[分]?)?(?:\s*[半]?)?)/g,
      build(m) {
        const time = parseTime(m[1]);
        const d = todayAt(time.hour, time.minute);
        // 如果时间已过，默认明天
        if (d <= new Date()) d.setDate(d.getDate() + 1);
        return d;
      }
    },
  ];

  // ── 匹配并去重 ──
  const seen = new Set();

  for (const pat of patterns) {
    pat.regex.lastIndex = 0;
    let match;
    while ((match = pat.regex.exec(text)) !== null) {
      try {
        const date = pat.build(match);
        if (isNaN(date.getTime())) continue;

        const key = date.toISOString().slice(0, 16);
        if (seen.has(key)) continue;
        seen.add(key);

        // 尝试提取该日期附近的事件描述
        const matchIndex = match.index;
        const contextStart = Math.max(0, matchIndex - 30);
        const contextEnd = Math.min(text.length, matchIndex + match[0].length + 60);
        let context = text.slice(contextStart, contextEnd).trim();

        // 移除匹配的日期串，剩下的就是事件描述
        let desc = context.replace(match[0], '').trim();
        // 清理前缀/后缀杂项
        desc = desc.replace(/^[，,。！？\s]+/, '').replace(/[，,。！？\s]+$/, '');
        if (!desc || desc.length < 1) {
          desc = text.slice(contextStart, contextEnd).replace(match[0], '').trim();
        }
        if (!desc || desc.length < 1) desc = '未命名日程';

        // 限制描述长度
        if (desc.length > 40) desc = desc.slice(0, 40) + '...';

        events.push({ date, text: desc });
      } catch (e) {
        // 单条匹配失败不中断整体
      }
    }
  }

  // 按日期排序
  events.sort((a, b) => a.date - b.date);

  return events;
}

// 浏览器环境暴露
if (typeof window !== 'undefined') {
  window.extractEvents = extractEvents;
}
