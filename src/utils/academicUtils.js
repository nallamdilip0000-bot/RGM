/**
 * Academic Normalization Utilities for Department and Year
 */

const DEPT_MAP = {
  'cse': 'CSE',
  'computer science & engineering': 'CSE',
  'computer science and engineering': 'CSE',
  'computer science': 'CSE',

  'cse (ai & ml)': 'CSE (AI & ML)',
  'cse(ai&ml)': 'CSE (AI & ML)',
  'cse (aiml)': 'CSE (AI & ML)',
  'cse(aiml)': 'CSE (AI & ML)',
  'computer science & engineering (ai & ml)': 'CSE (AI & ML)',
  'computer science and engineering (ai & ml)': 'CSE (AI & ML)',
  'computer science and engineering (artificial intelligence and machine learning)': 'CSE (AI & ML)',
  'ai & ml': 'CSE (AI & ML)',
  'aiml': 'CSE (AI & ML)',

  'cse (ai)': 'CSE (AI)',
  'cse(ai)': 'CSE (AI)',
  'computer science & engineering (ai)': 'CSE (AI)',
  'computer science and engineering (ai)': 'CSE (AI)',
  'computer science and engineering (artificial intelligence)': 'CSE (AI)',
  'ai': 'CSE (AI)',

  'cse (data science)': 'CSE (Data Science)',
  'cse(data science)': 'CSE (Data Science)',
  'cse (ds)': 'CSE (Data Science)',
  'cse(ds)': 'CSE (Data Science)',
  'computer science & engineering (data science)': 'CSE (Data Science)',
  'computer science and engineering (data science)': 'CSE (Data Science)',
  'data science': 'CSE (Data Science)',

  'cse (cyber security)': 'CSE (Cyber Security)',
  'cse(cyber security)': 'CSE (Cyber Security)',
  'cse (cybersecurity)': 'CSE (Cyber Security)',
  'cse(cybersecurity)': 'CSE (Cyber Security)',
  'cse (cs)': 'CSE (Cyber Security)',
  'cse(cs)': 'CSE (Cyber Security)',
  'computer science & engineering (cyber security)': 'CSE (Cyber Security)',
  'computer science and engineering (cyber security)': 'CSE (Cyber Security)',
  'cyber security': 'CSE (Cyber Security)',
  'cybersecurity': 'CSE (Cyber Security)',

  'it': 'IT',
  'information technology': 'IT',

  'ece': 'ECE',
  'electronics & communication': 'ECE',
  'electronics and communication': 'ECE',
  'electronics & communication engineering': 'ECE',
  'electronics and communication engineering': 'ECE',

  'eee': 'EEE',
  'electrical & electronics': 'EEE',
  'electrical and electronics': 'EEE',
  'electrical & electronics engineering': 'EEE',
  'electrical and electronics engineering': 'EEE',

  'mech': 'MECH',
  'mechanical': 'MECH',
  'mechanical engineering': 'MECH',

  'civil': 'CIVIL',
  'civil engineering': 'CIVIL'
};

const YEAR_MAP = {
  '1': '1st Year',
  '1st': '1st Year',
  '1st year': '1st Year',
  'i': '1st Year',
  'i year': '1st Year',
  'first year': '1st Year',

  '2': '2nd Year',
  '2nd': '2nd Year',
  '2nd year': '2nd Year',
  'ii': '2nd Year',
  'ii year': '2nd Year',
  'second year': '2nd Year',

  '3': '3rd Year',
  '3rd': '3rd Year',
  '3rd year': '3rd Year',
  'iii': '3rd Year',
  'iii year': '3rd Year',
  'third year': '3rd Year',

  '4': '4th Year',
  '4th': '4th Year',
  '4th year': '4th Year',
  'iv': '4th Year',
  'iv year': '4th Year',
  'fourth year': '4th Year'
};

function normalizeDepartment(dept) {
  if (!dept) return '';
  const key = String(dept).trim().toLowerCase();
  if (DEPT_MAP[key]) return DEPT_MAP[key];

  if (key.includes('ai') && key.includes('ml')) return 'CSE (AI & ML)';
  if (key.includes('data science') || key.includes(' ds') || key.endsWith('(ds)')) return 'CSE (Data Science)';
  if (key.includes('cyber') || key.includes(' cs') || key.endsWith('(cs)')) return 'CSE (Cyber Security)';
  if (key.includes('ai') || key.includes('artificial intelligence')) return 'CSE (AI)';
  if (key.includes('cse') || key.includes('computer science')) return 'CSE';
  if (key.includes('it') || key.includes('information tech')) return 'IT';
  if (key.includes('ece') || key.includes('electronics')) return 'ECE';
  if (key.includes('eee') || key.includes('electrical')) return 'EEE';
  if (key.includes('mech')) return 'MECH';
  if (key.includes('civil')) return 'CIVIL';

  return dept.trim();
}

function normalizeYear(yr) {
  if (!yr) return '';
  const key = String(yr).trim().toLowerCase();
  if (YEAR_MAP[key]) return YEAR_MAP[key];

  if (/\b(1|1st|first|i)\b/i.test(key) && !/\b(2|2nd|3|3rd|4|4th|ii|iii|iv)\b/i.test(key)) return '1st Year';
  if (/\b(2|2nd|second|ii)\b/i.test(key) && !/\b(3|3rd|4|4th|iii|iv)\b/i.test(key)) return '2nd Year';
  if (/\b(3|3rd|third|iii)\b/i.test(key) && !/\b(4|4th|iv)\b/i.test(key)) return '3rd Year';
  if (/\b(4|4th|fourth|iv)\b/i.test(key)) return '4th Year';

  return yr.trim();
}

function isDepartmentMatch(dept1, dept2) {
  if (!dept1 || !dept2) return false;
  return normalizeDepartment(dept1).toLowerCase() === normalizeDepartment(dept2).toLowerCase();
}

function isYearMatch(yr1, yr2) {
  if (!yr1 || !yr2) return false;
  return normalizeYear(yr1).toLowerCase() === normalizeYear(yr2).toLowerCase();
}

module.exports = {
  normalizeDepartment,
  normalizeYear,
  isDepartmentMatch,
  isYearMatch
};
