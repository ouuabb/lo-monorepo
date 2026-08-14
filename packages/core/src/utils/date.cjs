class DateUtils {
  static today() {
    return new Date().toISOString().slice(0, 10);
  }
  
  static format(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }
  
  static isOlderThan(date, days) {
    const now = new Date();
    const target = new Date(date);
    const diffTime = now - target;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays > days;
  }
  
  static getWeekNumber(date) {
    const d = new Date(date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const diff = d - startOfYear;
    return Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7);
  }
}

module.exports = DateUtils;