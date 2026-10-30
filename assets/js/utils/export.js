/**
 * export.js — Xuất dữ liệu ra PDF, Excel, PNG
 * NoadD.Vo LMS & Exam System 3.0
 */

const Exporter = (() => {

    // ============================================================
    // EXCEL EXPORT (dùng SheetJS)
    // ============================================================

    /**
     * Xuất kết quả thi ra file Excel
     * @param {Array} submissions - Danh sách bài nộp
     * @param {string} examTitle - Tên đề thi
     */
    const exportToExcel = (submissions, examTitle = 'Ket qua thi') => {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện SheetJS chưa được tải!');
            return;
        }

        const rows = submissions.map((s, idx) => ({
            'STT': idx + 1,
            'Họ và tên': s.studentName || '',
            'Lớp': s.studentClass || '',
            'Điểm': s.score ?? '',
            'Số câu đúng': s.correctCount ?? '',
            'Tổng số câu': s.totalCount ?? '',
            'Thời gian nộp': s.submittedAt ? new Date(s.submittedAt).toLocaleString('vi-VN') : '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);

        // Độ rộng cột
        ws['!cols'] = [
            { wch: 6 },  // STT
            { wch: 26 }, // Họ và tên
            { wch: 12 }, // Lớp
            { wch: 10 }, // Điểm
            { wch: 15 }, // Số câu đúng
            { wch: 15 }, // Tổng số câu
            { wch: 22 }, // Thời gian nộp
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kết quả');

        // Sheet tóm tắt thống kê
        const scores = submissions.map(s => s.score).filter(s => s != null);
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;
        const max = scores.length ? Math.max(...scores) : 0;
        const min = scores.length ? Math.min(...scores) : 0;
        const pass = scores.filter(s => s >= 5).length;

        const summaryRows = [
            { 'Chỉ số': 'Tổng số bài nộp', 'Giá trị': submissions.length },
            { 'Chỉ số': 'Điểm trung bình', 'Giá trị': avg },
            { 'Chỉ số': 'Điểm cao nhất', 'Giá trị': max },
            { 'Chỉ số': 'Điểm thấp nhất', 'Giá trị': min },
            { 'Chỉ số': 'Số đạt (≥5đ)', 'Giá trị': pass },
            { 'Chỉ số': 'Tỉ lệ đạt', 'Giá trị': submissions.length ? `${((pass / submissions.length) * 100).toFixed(1)}%` : '0%' },
        ];

        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Thống kê');

        // Tải file
        const fileName = `${examTitle.replace(/[^a-zA-Z0-9À-ỹ ]/g, '_')}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // ============================================================
    // PDF / PRINT
    // ============================================================

    /**
     * In trang hiện tại (dùng browser print)
     * @param {string} containerId - ID của vùng cần in
     */
    const printSection = (containerId, customTitle = 'Đề thi') => {
        const content = document.getElementById(containerId);
        if (!content) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <base href="${window.location.href}">
                <title>${customTitle}</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=Comfortaa:wght@400;600;700&family=Itim&family=Mali:ital,wght@0,400;0,600;0,700;1,400&family=Patrick+Hand&family=Playpen+Sans:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Roboto+Slab:wght@400;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
                <link rel="stylesheet" href="assets/css/main.css">
                <link rel="stylesheet" href="assets/css/components.css">
                <link rel="stylesheet" href="assets/css/paper.css">
                <style>
                    body {
                        margin: 0;
                        padding: 16px;
                        background: #F1F5F9;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    @media print {
                        body {
                            background: transparent !important;
                            padding: 0 !important;
                        }
                        .solution-box, .no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 800);
    };

    // ============================================================
    // PNG EXPORT (dùng html2canvas)
    // ============================================================

    /**
     * Xuất phần tử DOM thành ảnh PNG
     * @param {HTMLElement} element - Phần tử cần chụp
     * @param {string} filename - Tên file xuất
     */
    const exportToPng = async (element, filename = 'de-thi') => {
        if (typeof html2canvas === 'undefined') {
            alert('Thư viện html2canvas chưa được tải!');
            return;
        }
        try {
            showToast('Đang tạo ảnh...', 'info');
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
            });
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('Đã xuất ảnh thành công!', 'success');
        } catch (e) {
            console.error('[Export] Lỗi xuất PNG:', e);
            showToast('Có lỗi khi xuất ảnh!', 'error');
        }
    };

    /**
     * Helper: hiển thị toast notification
     */
    const showToast = (msg, type = 'info') => {
        if (typeof Toast !== 'undefined') {
            Toast.show(msg, type);
        } else {
            console.log(`[Toast] ${type}: ${msg}`);
        }
    };

    return { exportToExcel, printSection, exportToPng };
})();

if (typeof window !== 'undefined') {
    window.Exporter = Exporter;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Exporter;
}
