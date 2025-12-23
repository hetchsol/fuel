import React from 'react';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onStartDateChange: (date: string) => void;
    onEndDateChange: (date: string) => void;
    onQuickFilter: (start: string, end: string, label: string) => void;
}

export default function DateRangePicker({
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    onQuickFilter
}: DateRangePickerProps) {
    // Helper function to format date as YYYY-MM-DD
    const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Quick filter handlers
    const handleToday = () => {
        const today = formatDate(new Date());
        onQuickFilter(today, today, 'Today');
    };

    const handleLast7Days = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        onQuickFilter(formatDate(start), formatDate(end), 'Last 7 Days');
    };

    const handleThisWeek = () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const start = new Date(now);
        // Monday is 1, Sunday is 0
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        start.setDate(start.getDate() - diff);
        onQuickFilter(formatDate(start), formatDate(now), 'This Week');
    };

    const handleLastWeek = () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const lastSunday = new Date(now);
        lastSunday.setDate(lastSunday.getDate() - dayOfWeek);
        const lastMonday = new Date(lastSunday);
        lastMonday.setDate(lastMonday.getDate() - 6);
        onQuickFilter(formatDate(lastMonday), formatDate(lastSunday), 'Last Week');
    };

    const handleThisMonth = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        onQuickFilter(formatDate(start), formatDate(now), 'This Month');
    };

    const handleLastMonth = () => {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        onQuickFilter(formatDate(lastMonth), formatDate(lastDayOfLastMonth), 'Last Month');
    };

    const handleClear = () => {
        onStartDateChange('');
        onEndDateChange('');
    };

    return (
        <div className="bg-gradient-to-br from-white to-blue-50 p-8 rounded-2xl shadow-2xl border border-blue-100 transform hover:scale-[1.01] transition-all duration-300">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-6">Select Date Range</h3>

            {/* Date Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="transform hover:scale-105 transition-transform duration-200">
                    <label htmlFor="start-date" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                        Start Date
                    </label>
                    <input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => onStartDateChange(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-300 focus:border-blue-500 shadow-lg hover:shadow-xl transition-all duration-300 bg-white"
                    />
                </div>
                <div className="transform hover:scale-105 transition-transform duration-200">
                    <label htmlFor="end-date" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                        End Date
                    </label>
                    <input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => onEndDateChange(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-300 focus:border-blue-500 shadow-lg hover:shadow-xl transition-all duration-300 bg-white"
                    />
                </div>
            </div>

            {/* Quick Filters */}
            <div>
                <p className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide flex items-center">
                    <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Quick Filters
                </p>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleToday}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-blue-600 hover:to-blue-700 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        Today
                    </button>
                    <button
                        onClick={handleLast7Days}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-indigo-600 hover:to-indigo-700 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        Last 7 Days
                    </button>
                    <button
                        onClick={handleThisWeek}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-purple-600 hover:to-purple-700 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        This Week
                    </button>
                    <button
                        onClick={handleLastWeek}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-pink-600 hover:to-pink-700 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        Last Week
                    </button>
                    <button
                        onClick={handleThisMonth}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-green-600 hover:to-green-700 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        This Month
                    </button>
                    <button
                        onClick={handleLastMonth}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-teal-600 hover:to-teal-700 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        Last Month
                    </button>
                    <button
                        onClick={handleClear}
                        className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-gray-400 to-gray-500 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-gray-500 hover:to-gray-600 transform hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Validation Message */}
            {startDate && endDate && startDate > endDate && (
                <div className="mt-4 p-4 bg-gradient-to-r from-red-50 to-pink-50 border-l-4 border-red-500 text-red-700 text-sm font-semibold rounded-xl shadow-lg transform hover:scale-[1.02] transition-transform">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Start date must be before or equal to end date
                    </div>
                </div>
            )}
        </div>
    );
}
