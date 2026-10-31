/**
 * timer.js — Đồng hồ đếm ngược cho kỳ thi
 * NoadD.Vo LMS & Exam System 3.0
 */

const ExamTimer = (() => {
    let totalSeconds = 0;
    let remainingSeconds = 0;
    let targetEndTime = null;
    let intervalId = null;
    let onTickCallback = null;
    let onFinishCallback = null;
    let isRunning = false;

    /**
     * Bắt đầu đồng hồ đếm ngược
     * @param {number} durationMinutes - Thời gian thi (phút)
     * @param {Function} onTick - Callback mỗi giây: (remaining, total, percent)
     * @param {Function} onFinish - Callback khi hết giờ
     * @param {number|null} [initialRemainingSeconds] - Số giây còn lại nếu tiếp tục bài làm dở dang
     */
    const start = (durationMinutes, onTick, onFinish, initialRemainingSeconds = null) => {
        totalSeconds = Math.max(1, durationMinutes * 60);
        if (typeof initialRemainingSeconds === 'number') {
            if (initialRemainingSeconds <= 0) {
                remainingSeconds = 0;
                isRunning = false;
                targetEndTime = null;
                if (onTick) onTick(0, totalSeconds, 0);
                if (onFinish) onFinish();
                return;
            }
            if (initialRemainingSeconds <= totalSeconds) {
                remainingSeconds = Math.floor(initialRemainingSeconds);
            } else {
                remainingSeconds = totalSeconds;
            }
        } else {
            remainingSeconds = totalSeconds;
        }

        onTickCallback = onTick;
        onFinishCallback = onFinish;
        isRunning = true;
        targetEndTime = Date.now() + remainingSeconds * 1000;

        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        // Gọi ngay lần đầu
        tick();

        intervalId = setInterval(() => {
            if (!isRunning) return;

            // Đồng bộ với đồng hồ hệ thống thực tế (chống trễ do browser tab throttling khi thu nhỏ/đổi tab)
            if (targetEndTime) {
                const diffSec = Math.round((targetEndTime - Date.now()) / 1000);
                remainingSeconds = Math.max(0, diffSec);
            } else {
                remainingSeconds--;
            }

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
        targetEndTime = null;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };

    const pause = () => {
        if (isRunning && targetEndTime) {
            remainingSeconds = Math.max(0, Math.round((targetEndTime - Date.now()) / 1000));
        }
        isRunning = false;
        targetEndTime = null;
    };

    const resume = () => {
        if (!isRunning && remainingSeconds > 0) {
            targetEndTime = Date.now() + remainingSeconds * 1000;
            isRunning = true;
        }
    };

    /**
     * Kiểm tra tức thì khi quay lại tab (visibilitychange / focus)
     */
    const checkNow = () => {
        if (!isRunning || !targetEndTime) return;
        const diffSec = Math.round((targetEndTime - Date.now()) / 1000);
        remainingSeconds = Math.max(0, diffSec);
        tick();
        if (remainingSeconds <= 0) {
            stop();
            if (onFinishCallback) onFinishCallback();
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                checkNow();
            }
        });
        window.addEventListener('focus', checkNow);
    }

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
        getTotal: () => totalSeconds,
        getElapsed: () => Math.max(0, totalSeconds - remainingSeconds),
        getPercent: () => totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0,
        isRunning: () => isRunning,
    };
})();

window.ExamTimer = ExamTimer;
