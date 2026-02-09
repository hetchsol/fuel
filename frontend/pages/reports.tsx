import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DateRangePicker from '../components/DateRangePicker';

interface Product {
    product_type: string;
    transactions: number;
    volume: number;
    revenue: number;
    unit: string;
}

interface DailyBreakdown {
    date: string;
    transactions: number;
    revenue: number;
}

interface ReportData {
    period: {
        start_date: string;
        end_date: string;
    };
    summary: {
        total_transactions: number;
        total_revenue: number;
        total_volume: number;
    };
    products: Product[];
    daily_breakdown: DailyBreakdown[];
    generated_by?: {
        user_id: string;
        username: string;
        role: string;
    };
    generated_at?: string;
}

export default function Reports() {
    const router = useRouter();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('');

    // Check authorization on mount
    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
            router.push('/login');
            return;
        }

        try {
            const user = JSON.parse(userStr);
            if (!['owner', 'supervisor'].includes(user.role)) {
                router.push('/');
                return;
            }
        } catch (e) {
            router.push('/login');
        }
    }, [router]);

    const fetchReport = async () => {
        if (!startDate || !endDate) {
            setError('Please select both start and end dates');
            return;
        }

        if (startDate > endDate) {
            setError('Start date must be before or equal to end date');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                throw new Error('No access token found');
            }

            const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';
            const url = `${BASE}/reports/date-range?start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Station-Id': localStorage.getItem('stationId') || 'ST001',
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized. Please log in again.');
                } else if (response.status === 403) {
                    throw new Error('Access forbidden. This feature is restricted to supervisors and owners.');
                }
                throw new Error(`Error fetching report: ${response.statusText}`);
            }

            const data = await response.json();
            setReportData(data);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch report');
            console.error('Error fetching report:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickFilter = (start: string, end: string, label: string) => {
        setStartDate(start);
        setEndDate(end);
        setSelectedFilter(label);
    };

    const formatCurrency = (amount: number) => {
        return `K${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8 transform hover:scale-[1.01] transition-transform duration-300">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent drop-shadow-lg">
                        Sales Reports
                    </h1>
                    <p className="text-gray-600 mt-2 text-lg">
                        Generate comprehensive sales reports by date range
                    </p>
                </div>

                {/* Date Range Picker */}
                <div className="mb-6">
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                        onQuickFilter={handleQuickFilter}
                    />
                </div>

                {/* Generate Report Button */}
                <div className="mb-8">
                    <button
                        onClick={fetchReport}
                        disabled={loading || !startDate || !endDate || startDate > endDate}
                        className={`px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform ${
                            loading || !startDate || !endDate || startDate > endDate
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-inner'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95'
                        }`}
                    >
                        {loading ? (
                            <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating Report...
                            </span>
                        ) : 'Generate Report'}
                    </button>
                    {selectedFilter && (
                        <span className="ml-4 px-4 py-2 bg-white rounded-full text-sm font-medium text-gray-700 shadow-md">
                            📅 {selectedFilter}
                        </span>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 p-6 bg-gradient-to-r from-red-50 to-pink-50 border-l-4 border-red-500 text-red-700 rounded-xl shadow-lg transform hover:scale-[1.02] transition-transform">
                        <div className="flex items-center">
                            <svg className="h-6 w-6 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium">{error}</span>
                        </div>
                    </div>
                )}

                {/* Report Results */}
                {reportData && (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 border border-gray-100">
                                <p className="text-sm text-gray-500 mb-2 font-medium uppercase tracking-wide">Date Range</p>
                                <p className="text-base font-bold text-gray-800 leading-tight">
                                    {reportData.period.start_date}
                                </p>
                                <p className="text-xs text-gray-500 my-1">to</p>
                                <p className="text-base font-bold text-gray-800">
                                    {reportData.period.end_date}
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                                <p className="text-sm text-blue-100 mb-2 font-medium uppercase tracking-wide">Total Transactions</p>
                                <p className="text-4xl font-bold text-white">
                                    {reportData.summary.total_transactions}
                                </p>
                                <p className="text-xs text-blue-200 mt-1">sales recorded</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                                <p className="text-sm text-green-100 mb-2 font-medium uppercase tracking-wide">Total Revenue</p>
                                <p className="text-4xl font-bold text-white">
                                    {formatCurrency(reportData.summary.total_revenue)}
                                </p>
                                <p className="text-xs text-green-200 mt-1">total earnings</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                                <p className="text-sm text-purple-100 mb-2 font-medium uppercase tracking-wide">Total Volume</p>
                                <p className="text-4xl font-bold text-white">
                                    {formatNumber(reportData.summary.total_volume)}
                                </p>
                                <p className="text-xs text-purple-200 mt-1">liters sold</p>
                            </div>
                        </div>

                        {/* Product Breakdown Table */}
                        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden transform hover:scale-[1.01] transition-transform duration-300">
                            <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 border-b border-blue-700">
                                <h2 className="text-2xl font-bold text-white flex items-center">
                                    <svg className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    Product Breakdown
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Product Type
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Transactions
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Volume
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Revenue
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {reportData.products.map((product, index) => (
                                            <tr key={index} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 transform hover:scale-[1.01]">
                                                <td className="px-8 py-5 whitespace-nowrap font-bold text-gray-900 text-lg">
                                                    <div className="flex items-center">
                                                        <div className={`w-3 h-3 rounded-full mr-3 ${index === 0 ? 'bg-blue-500' : 'bg-indigo-500'}`}></div>
                                                        {product.product_type}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 whitespace-nowrap">
                                                    <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full font-semibold">
                                                        {product.transactions}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 whitespace-nowrap text-gray-700 font-medium">
                                                    {formatNumber(product.volume)} <span className="text-gray-500 text-sm">{product.unit}</span>
                                                </td>
                                                <td className="px-8 py-5 whitespace-nowrap font-bold text-green-600 text-lg">
                                                    {formatCurrency(product.revenue)}
                                                </td>
                                            </tr>
                                        ))}
                                        {/* Totals Row */}
                                        <tr className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg">
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                    TOTAL
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                {reportData.summary.total_transactions}
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap">
                                                {formatNumber(reportData.summary.total_volume)}
                                            </td>
                                            <td className="px-8 py-6 whitespace-nowrap text-yellow-300 text-xl">
                                                {formatCurrency(reportData.summary.total_revenue)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Daily Breakdown */}
                        {reportData.daily_breakdown && reportData.daily_breakdown.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden transform hover:scale-[1.01] transition-transform duration-300">
                                <div className="px-8 py-6 bg-gradient-to-r from-indigo-600 to-purple-600 border-b border-indigo-700">
                                    <h2 className="text-2xl font-bold text-white flex items-center">
                                        <svg className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Daily Breakdown
                                    </h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Date
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Transactions
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Revenue
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {reportData.daily_breakdown.map((day, index) => (
                                                <tr key={index} className="hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 transform hover:scale-[1.01]">
                                                    <td className="px-8 py-5 whitespace-nowrap font-bold text-gray-900 text-lg">
                                                        <div className="flex items-center">
                                                            <div className="w-2 h-2 bg-indigo-500 rounded-full mr-3"></div>
                                                            {day.date}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 whitespace-nowrap">
                                                        <span className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full font-semibold">
                                                            {day.transactions}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5 whitespace-nowrap text-green-600 font-bold text-lg">
                                                        {formatCurrency(day.revenue)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Report Metadata */}
                        {reportData.generated_by && (
                            <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-6 rounded-2xl shadow-lg border border-gray-200">
                                <div className="flex items-center text-sm text-gray-700">
                                    <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="font-medium">
                                        Report generated by: <span className="text-blue-600 font-bold">{reportData.generated_by.username}</span> ({reportData.generated_by.role})
                                    </p>
                                </div>
                                {reportData.generated_at && (
                                    <div className="flex items-center mt-2 text-sm text-gray-600">
                                        <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p>
                                            Generated at: <span className="font-semibold">{new Date(reportData.generated_at).toLocaleString()}</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!reportData && !loading && !error && (
                    <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-2xl p-16 text-center transform hover:scale-[1.02] transition-transform duration-300">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-32 h-32 bg-blue-100 rounded-full animate-pulse"></div>
                            </div>
                            <svg
                                className="relative mx-auto h-24 w-24 text-blue-500 mb-6 animate-bounce"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-3">Ready to Generate Reports</h3>
                        <p className="text-lg text-gray-600 max-w-md mx-auto">
                            Select a date range above and click "Generate Report" to view comprehensive sales analytics
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
