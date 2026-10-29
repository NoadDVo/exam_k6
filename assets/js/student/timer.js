/**
 * timer.js — Đồng hồ đếm ngược cho kỳ thi
 * NoadD.Vo LMS & Exam System 3.0
 */

const ExamTimer = (() => {
    let totalSeconds = 0;
    let remainingSeconds = 0;
    let intervalId = null;
    let onTickCallback = null;
    let onFinishCallback = null;
    let isRunning = false;

    /**
     * Bắt đầu đồng hồ
     * @param {number} durationMinutes - Thời gian thi (phút)
     * @param {Function} onTick - Callback mỗi giây: (remaining, total, percent)
     * @param {Function} onFinish - Callback khi hết giờ
     */
    const start = (durationMinutes, onTick, onFinish) => {
        totalSeconds = durationMinutes * 60;
        remainingSeconds = totalSeconds;
        onTickCallback = onTick;
        onFinishCallback = onFinish;
        isRunning = true;

        // Gọi ngay lần đầu
        tick();

        intervalId = setInterval(() => {
            if (!isRunning) return;
            remainingSeconds--;
            tick();

            if (remainingSeconds <= 0) {
                stop();
                if (onFinishCallback) onFinishCallback();
            }
        }, 1000);
    };

    const tick = () => {
        if (onTickCallback) {
            const percent = (remainingSeconds / totalSeconds) * 100;
            onTickCallback(remainingSeconds, totalSeconds, percent);
        }
    };

    const stop = () => {
        isRunning = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };

    const pause = () => { isRunning = false; };
    const resume = () => { isRunning = true; };

    /**
     * Chuyển giây thành chuỗi MM:SS
     */
    const format = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    /**
     * Xác định màu sắc theo % thời gian còn lại
     * @returns {'normal'|'warning'|'danger'}
     */
    const getState = (percent) => {
        if (percent > 33) return 'normal';
        if (percent > 10) return 'warning';
        return 'danger';
    };

    return {
        start, stop, pause, resume,
        format,
        getState,
        getRemaining: () => remainingSeconds,
        getPercent: () => totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0,
        isRunning: () => isRunning,
    };
})();

window.ExamTimer = ExamTimer;
