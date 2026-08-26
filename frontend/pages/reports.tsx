import { authFetch, BASE, getHeaders, downloadExport } from '../lib/api'
import { useState, useEffect, useCallback, Fragment } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DateRangePicker from '../components/DateRangePicker';
import Pagination from '../components/Pagination'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import AdvancedReports from './advanced-reports'
import TankReadingsReport from './tank-readings-report'
import { formatDateToDisplay, formatDateTimeToDisplay } from '../lib/dateUtils'

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
        full_name?: string;
        role: string;
    };
    generated_at?: string;
}

interface DailySalesData {
    date: string;
    diesel: {
        total_volume: number;
        total_amount: number;
        sales_count: number;
        shifts: string[];
        sales: any[];
    };
    petrol: {
        total_volume: number;
        total_amount: number;
        sales_count: number;
        shifts: string[];
        sales: any[];
    };
    summary: {
        total_volume: number;
        total_revenue: number;
        total_transactions: number;
    };
}

function SalesReportsView() {
    const router = useRouter();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [dailySalesData, setDailySalesData] = useState<DailySalesData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('');

    // Daily Breakdown: pagination + per-row expand-for-detail (fetched on
    // demand and cached per date so re-expanding doesn't re-fetch).
    const DAILY_BREAKDOWN_PAGE_SIZE = 15;
    const [dailyBreakdownPage, setDailyBreakdownPage] = useState(1);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
    const [dayDetailCache, setDayDetailCache] = useState<Record<string, DailySalesData>>({});
    const [dayDetailLoading, setDayDetailLoading] = useState<string | null>(null);

    const toggleDayExpand = async (date: string) => {
        if (expandedDay === date) { setExpandedDay(null); return; }
        setExpandedDay(date);
        if (dayDetailCache[date]) return;
        setDayDetailLoading(date);
        try {
            const res = await authFetch(`${BASE}/sales-reports/daily/${date}`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setDayDetailCache(prev => ({ ...prev, [date]: data }));
            }
        } catch {
            // Detail is optional — row just stays expanded with no extra detail.
        } finally {
            setDayDetailLoading(null);
        }
    };

    // Check authorization on mount
    useEffect(() => {
        const userStr = localStorage.getItem('user');
        if (!userStr) {
            router.push('/login');
            return;
        }

        try {
            const user = JSON.parse(userStr);
            if (!['owner', 'supervisor', 'manager'].includes(user.role)) {
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
        setDailySalesData(null);

        try {
            const url = `${BASE}/reports/date-range?start_date=${startDate}&end_date=${endDate}`;
            const response = await authFetch(url, {
                headers: {
                    ...getHeaders(),
                    'Content-Type': 'application/json',
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
            setDailyBreakdownPage(1);
            setExpandedDay(null);
            setDayDetailCache({});

            // When single day selected, also fetch detailed daily breakdown
            if (startDate === endDate) {
                try {
                    const dailyRes = await authFetch(`${BASE}/sales-reports/daily/${startDate}`, {
                        headers: getHeaders()
                    });
                    if (dailyRes.ok) {
                        const dailyData = await dailyRes.json();
                        setDailySalesData(dailyData);
                    }
                } catch {
                    // Daily detail is optional, don't block the main report
                }
            }
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

    const getExportConfig = useCallback((): ExportConfig | null => {
        if (!reportData?.products) return null
        return {
            title: 'Sales Report',
            subtitle: `${reportData.period?.start_date || ''} to ${reportData.period?.end_date || ''}`,
            filename: `sales_report_${startDate}_${endDate}`,
            summaryCards: [
                { label: 'Total Transactions', value: reportData.summary?.total_transactions || 0 },
                { label: 'Total Revenue', value: `ZMW ${formatNumber(reportData.summary?.total_revenue || 0)}` },
                { label: 'Total Volume', value: `${formatNumber(reportData.summary?.total_volume || 0)} L` },
            ],
            columns: [
                { header: 'Product', key: 'product_type' },
                { header: 'Transactions', key: 'transactions', format: 'number' },
                { header: 'Volume', key: 'volume', format: 'number' },
                { header: 'Revenue', key: 'revenue', format: 'currency' },
            ],
            data: reportData.products,
        }
    }, [reportData, startDate, endDate])

    return (
        <div>
            <div>
                {/* Header */}
                <div className="mb-8 transform hover:scale-[1.01] transition-transform duration-300">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-action-primary to-indigo-600 bg-clip-text text-transparent drop-shadow-lg">
                        Sales Reports
                    </h1>
                    <p className="text-content-secondary mt-2 text-lg">
                        Generate comprehensive sales reports by date range
                    </p>
                </div>

                {/* Related Pages */}
                <div className="mb-6 flex flex-wrap gap-3">
                    <span className="text-sm text-content-secondary self-center font-medium">Related:</span>
                    <Link href="/shift-reconciliation" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
                        Shift Reconciliation
                    </Link>
                    <Link href="/tank-readings-report" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
                        Tank Readings Report
                    </Link>
                    <Link href="/advanced-reports" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
                        Advanced Reports
                    </Link>
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
                                ? 'bg-surface-border text-content-secondary cursor-not-allowed shadow-inner'
                                : 'bg-gradient-to-r from-action-primary to-indigo-600 text-white hover:from-action-primary-hover hover:to-indigo-700 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95'
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
                        <span className="ml-4 px-4 py-2 bg-surface-card rounded-full text-sm font-medium text-content-secondary shadow-md">
                            📅 {selectedFilter}
                        </span>
                    )}
                    {reportData && startDate && endDate && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            <button
                                onClick={() => downloadExport(`/exports/sales?format=csv&start_date=${startDate}&end_date=${endDate}`, 'sales.csv')}
                                className="px-4 py-2 border border-action-primary text-action-primary font-medium rounded-lg hover:opacity-80 transition text-sm"
                            >
                                CSV
                            </button>
                            <button
                                onClick={() => downloadExport(`/exports/sales?format=excel&start_date=${startDate}&end_date=${endDate}`, 'sales.xlsx')}
                                className="px-4 py-2 border border-action-primary text-action-primary font-medium rounded-lg hover:opacity-80 transition text-sm"
                            >
                                Excel
                            </button>
                            <ExportButtons getConfig={getExportConfig} />
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 p-6 bg-gradient-to-r from-status-error-light to-pink-50 border-l-4 border-status-error text-status-error rounded-xl shadow-lg transform hover:scale-[1.02] transition-transform">
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
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                            <div className="bg-gradient-to-br from-surface-card to-surface-bg p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 border border-surface-border">
                                <p className="text-sm text-content-secondary mb-2 font-medium uppercase tracking-wide">Date Range</p>
                                <p className="text-base font-bold text-content-primary leading-tight">
                                    {reportData.period.start_date}
                                </p>
                                <p className="text-xs text-content-secondary my-1">to</p>
                                <p className="text-base font-bold text-content-primary">
                                    {reportData.period.end_date}
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-action-primary to-action-primary p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 min-w-0">
                                <p className="text-sm text-blue-100 mb-2 font-medium uppercase tracking-wide">Total Transactions</p>
                                <p className="text-2xl sm:text-3xl font-bold text-white break-words">
                                    {reportData.summary.total_transactions}
                                </p>
                                <p className="text-xs text-blue-200 mt-1">sales recorded</p>
                            </div>
                            <div className="bg-gradient-to-br from-status-success to-emerald-600 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 min-w-0">
                                <p className="text-sm text-green-100 mb-2 font-medium uppercase tracking-wide">Total Revenue</p>
                                <p className="text-2xl sm:text-3xl font-bold text-white break-words">
                                    {formatCurrency(reportData.summary.total_revenue)}
                                </p>
                                <p className="text-xs text-green-200 mt-1">total earnings</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 min-w-0">
                                <p className="text-sm text-purple-100 mb-2 font-medium uppercase tracking-wide">Total Volume</p>
                                <p className="text-2xl sm:text-3xl font-bold text-white break-words">
                                    {formatNumber(reportData.summary.total_volume)}
                                </p>
                                <p className="text-xs text-purple-200 mt-1">liters sold</p>
                            </div>
                        </div>

                        {/* Product Breakdown Table */}
                        <div className="bg-surface-card rounded-2xl shadow-2xl overflow-hidden transform hover:scale-[1.01] transition-transform duration-300">
                            <div className="px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-r from-action-primary to-indigo-600 border-b border-action-primary-hover">
                                <h2 className="text-2xl font-bold text-white flex items-center">
                                    <svg className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    Product Breakdown
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-surface-bg">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                Product Type
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                Transactions
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                Volume
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                Revenue
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-surface-card divide-y divide-surface-border">
                                        {reportData.products.map((product, index) => (
                                            <tr key={index} className="hover:bg-gradient-to-r hover:from-action-primary-light hover:to-indigo-50 transition-all duration-200 transform hover:scale-[1.01]">
                                                <td className="px-8 py-5 whitespace-nowrap font-bold text-content-primary text-lg">
                                                    <div className="flex items-center">
                                                        <div className={`w-3 h-3 rounded-full mr-3 ${index === 0 ? 'bg-action-primary' : 'bg-indigo-500'}`}></div>
                                                        {product.product_type}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 whitespace-nowrap">
                                                    <span className="px-4 py-2 bg-action-primary-light text-action-primary rounded-full font-semibold">
                                                        {product.transactions}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 whitespace-nowrap text-content-secondary font-medium">
                                                    {formatNumber(product.volume)} <span className="text-content-secondary text-sm">{product.unit}</span>
                                                </td>
                                                <td className="px-8 py-5 whitespace-nowrap font-bold text-status-success text-lg">
                                                    {formatCurrency(product.revenue)}
                                                </td>
                                            </tr>
                                        ))}
                                        {/* Totals Row */}
                                        <tr className="bg-gradient-to-r from-action-primary to-indigo-600 text-white font-bold text-lg">
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
                            <div className="bg-surface-card rounded-2xl shadow-2xl overflow-hidden transform hover:scale-[1.01] transition-transform duration-300">
                                <div className="px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-r from-indigo-600 to-purple-600 border-b border-indigo-700">
                                    <h2 className="text-2xl font-bold text-white flex items-center">
                                        <svg className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Daily Breakdown
                                    </h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-surface-bg">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                    Date
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                    Transactions
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">
                                                    Revenue
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-surface-card divide-y divide-surface-border">
                                            {reportData.daily_breakdown
                                                .slice((dailyBreakdownPage - 1) * DAILY_BREAKDOWN_PAGE_SIZE, dailyBreakdownPage * DAILY_BREAKDOWN_PAGE_SIZE)
                                                .map((day, index) => {
                                                    const isExpanded = expandedDay === day.date
                                                    const detail = dayDetailCache[day.date]
                                                    return (
                                                    <Fragment key={index}>
                                                    <tr
                                                        onClick={() => toggleDayExpand(day.date)}
                                                        className="cursor-pointer hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200">
                                                        <td className="px-8 py-5 whitespace-nowrap font-bold text-content-primary text-lg">
                                                            <div className="flex items-center">
                                                                <div className="w-2 h-2 bg-indigo-500 rounded-full mr-3"></div>
                                                                {formatDateToDisplay(day.date)}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5 whitespace-nowrap">
                                                            <span className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full font-semibold">
                                                                {day.transactions}
                                                            </span>
                                                        </td>
                                                        <td className="px-8 py-5 whitespace-nowrap text-status-success font-bold text-lg">
                                                            {formatCurrency(day.revenue)}
                                                        </td>
                                                        <td className="px-6 py-5 text-content-secondary text-sm whitespace-nowrap">
                                                            {isExpanded ? '▲ Hide' : '▼ Details'}
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan={4} className="px-8 py-5 bg-surface-bg">
                                                                {dayDetailLoading === day.date ? (
                                                                    <p className="text-sm text-content-secondary">Loading details...</p>
                                                                ) : !detail ? (
                                                                    <p className="text-sm text-content-secondary">No further detail available for this date.</p>
                                                                ) : (
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        {(['diesel', 'petrol'] as const).map(fuel => (
                                                                            <div key={fuel} className="bg-surface-card rounded-lg border border-surface-border p-4">
                                                                                <p className="text-xs font-semibold uppercase tracking-wide text-content-secondary mb-2">{fuel}</p>
                                                                                <div className="flex justify-between text-sm mb-1">
                                                                                    <span className="text-content-secondary">Volume</span>
                                                                                    <span className="font-mono font-medium text-content-primary">{detail[fuel].total_volume.toLocaleString()} L</span>
                                                                                </div>
                                                                                <div className="flex justify-between text-sm mb-1">
                                                                                    <span className="text-content-secondary">Revenue</span>
                                                                                    <span className="font-mono font-medium text-status-success">{formatCurrency(detail[fuel].total_amount)}</span>
                                                                                </div>
                                                                                <div className="flex justify-between text-sm mb-2">
                                                                                    <span className="text-content-secondary">Transactions</span>
                                                                                    <span className="font-medium text-content-primary">{detail[fuel].sales_count}</span>
                                                                                </div>
                                                                                {detail[fuel].shifts.length > 0 && (
                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                        {detail[fuel].shifts.map((shift, idx) => (
                                                                                            <span key={idx} className="px-2 py-0.5 text-xs rounded bg-surface-bg border border-surface-border text-content-secondary">{shift}</span>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                    </Fragment>
                                                    )
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination
                                    total={reportData.daily_breakdown.length}
                                    pageSize={DAILY_BREAKDOWN_PAGE_SIZE}
                                    page={dailyBreakdownPage}
                                    onPageChange={setDailyBreakdownPage}
                                />
                            </div>
                        )}

                        {/* Single-Day Detailed Breakdown */}
                        {dailySalesData && startDate === endDate && (
                            <div className="space-y-6">
                                {/* Diesel Sales */}
                                <div className="bg-surface-card rounded-2xl shadow-xl overflow-hidden">
                                    <div className="px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-r from-fuel-diesel to-orange-600 border-b">
                                        <h2 className="text-2xl font-bold text-white flex items-center">
                                            Diesel Sales Detail
                                            <span className="ml-3 text-base font-normal text-orange-100">{dailySalesData.diesel.sales_count} transactions</span>
                                        </h2>
                                    </div>
                                    <div className="p-6">
                                        {dailySalesData.diesel.sales_count > 0 ? (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-surface-bg p-4 rounded-lg">
                                                        <p className="text-sm text-content-secondary">Total Volume</p>
                                                        <p className="text-xl font-bold text-content-primary">{dailySalesData.diesel.total_volume.toLocaleString()} L</p>
                                                    </div>
                                                    <div className="bg-surface-bg p-4 rounded-lg">
                                                        <p className="text-sm text-content-secondary">Total Amount</p>
                                                        <p className="text-xl font-bold text-status-success">{formatCurrency(dailySalesData.diesel.total_amount)}</p>
                                                    </div>
                                                </div>
                                                {dailySalesData.diesel.shifts.length > 0 && (
                                                    <div>
                                                        <p className="text-sm font-medium text-content-secondary mb-2">Shifts:</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {dailySalesData.diesel.shifts.map((shift, idx) => (
                                                                <span key={idx} className="px-3 py-1 bg-action-primary-light text-action-primary rounded-full text-sm">{shift}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {dailySalesData.diesel.sales.length > 0 && (
                                                    <div className="border-t pt-4">
                                                        <p className="text-sm font-medium text-content-secondary mb-3">Transaction Details:</p>
                                                        <div className="space-y-2">
                                                            {dailySalesData.diesel.sales.map((sale, idx) => (
                                                                <div key={idx} className="bg-surface-bg p-3 rounded flex justify-between items-center">
                                                                    <div>
                                                                        <p className="text-sm font-medium">{sale.shift_id}</p>
                                                                        <p className="text-xs text-content-secondary">Vol: {sale.average_volume?.toFixed(2)}L | Disc: {sale.discrepancy_percent?.toFixed(4)}%</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-sm font-bold text-status-success">{formatCurrency(sale.total_amount)}</p>
                                                                        <p className="text-xs text-content-secondary">@{formatCurrency(sale.unit_price)}/L</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-content-secondary text-center py-4">No diesel sales for this date</p>
                                        )}
                                    </div>
                                </div>

                                {/* Petrol Sales */}
                                <div className="bg-surface-card rounded-2xl shadow-xl overflow-hidden">
                                    <div className="px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-r from-fuel-petrol to-emerald-600 border-b">
                                        <h2 className="text-2xl font-bold text-white flex items-center">
                                            Petrol Sales Detail
                                            <span className="ml-3 text-base font-normal text-green-100">{dailySalesData.petrol.sales_count} transactions</span>
                                        </h2>
                                    </div>
                                    <div className="p-6">
                                        {dailySalesData.petrol.sales_count > 0 ? (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-surface-bg p-4 rounded-lg">
                                                        <p className="text-sm text-content-secondary">Total Volume</p>
                                                        <p className="text-xl font-bold text-content-primary">{dailySalesData.petrol.total_volume.toLocaleString()} L</p>
                                                    </div>
                                                    <div className="bg-surface-bg p-4 rounded-lg">
                                                        <p className="text-sm text-content-secondary">Total Amount</p>
                                                        <p className="text-xl font-bold text-status-success">{formatCurrency(dailySalesData.petrol.total_amount)}</p>
                                                    </div>
                                                </div>
                                                {dailySalesData.petrol.shifts.length > 0 && (
                                                    <div>
                                                        <p className="text-sm font-medium text-content-secondary mb-2">Shifts:</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {dailySalesData.petrol.shifts.map((shift, idx) => (
                                                                <span key={idx} className="px-3 py-1 bg-status-success-light text-status-success rounded-full text-sm">{shift}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {dailySalesData.petrol.sales.length > 0 && (
                                                    <div className="border-t pt-4">
                                                        <p className="text-sm font-medium text-content-secondary mb-3">Transaction Details:</p>
                                                        <div className="space-y-2">
                                                            {dailySalesData.petrol.sales.map((sale, idx) => (
                                                                <div key={idx} className="bg-surface-bg p-3 rounded flex justify-between items-center">
                                                                    <div>
                                                                        <p className="text-sm font-medium">{sale.shift_id}</p>
                                                                        <p className="text-xs text-content-secondary">Vol: {sale.average_volume?.toFixed(2)}L | Disc: {sale.discrepancy_percent?.toFixed(4)}%</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-sm font-bold text-status-success">{formatCurrency(sale.total_amount)}</p>
                                                                        <p className="text-xs text-content-secondary">@{formatCurrency(sale.unit_price)}/L</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-content-secondary text-center py-4">No petrol sales for this date</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Report Metadata */}
                        {reportData.generated_by && (
                            <div className="bg-gradient-to-r from-surface-bg to-action-primary-light p-6 rounded-2xl shadow-lg border border-surface-border">
                                <div className="flex items-center text-sm text-content-secondary">
                                    <svg className="w-5 h-5 mr-2 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="font-medium">
                                        Report generated by: <span className="text-action-primary font-bold">{reportData.generated_by.full_name || reportData.generated_by.username}</span> ({reportData.generated_by.role})
                                    </p>
                                </div>
                                {reportData.generated_at && (
                                    <div className="flex items-center mt-2 text-sm text-content-secondary">
                                        <svg className="w-5 h-5 mr-2 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p>
                                            Generated at: <span className="font-semibold">{formatDateTimeToDisplay(reportData.generated_at)}</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!reportData && !loading && !error && (
                    <div className="bg-gradient-to-br from-surface-card to-action-primary-light rounded-2xl shadow-2xl p-8 sm:p-16 text-center transform hover:scale-[1.02] transition-transform duration-300">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-32 h-32 bg-action-primary-light rounded-full animate-pulse"></div>
                            </div>
                            <svg
                                className="relative mx-auto h-24 w-24 text-action-primary mb-6 animate-bounce"
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
                        <h3 className="text-2xl font-bold text-content-primary mb-3">Ready to Generate Reports</h3>
                        <p className="text-lg text-content-secondary max-w-md mx-auto">
                            Select a date range above and click "Generate Report" to view comprehensive sales analytics
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sales Consolidation ────────────────────────────────────────────────────

const fmt = (v: number) =>
  `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface ConsolidationRow {
  label: string
  sub_label: string
  total_revenue: number
  volume: number
  cash: number
  pos: number
  credit_prepaid: number
  credit_postpaid: number
}

interface ConsolidationResult {
  rows: ConsolidationRow[]
  totals: Omit<ConsolidationRow, 'label' | 'sub_label'>
  period: { start_date: string; end_date: string }
  period_type: string
  group_by: string
  fuel_type: string
}

// Shared segmented-control button — used by both the Sales Consolidation and
// Analytics filter rows.
const segBtn = (val: string, cur: string, set: (v: string) => void, label: string) => (
  <button key={val} onClick={() => set(val)}
    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
      cur === val
        ? 'bg-action-primary text-white border-action-primary'
        : 'border-surface-border text-content-secondary hover:border-action-primary hover:text-action-primary'
    }`}>
    {label}
  </button>
)

function SalesConsolidationView() {
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [period, setPeriod] = useState('day')
  const [groupBy, setGroupBy] = useState('none')
  const [fuelType, setFuelType] = useState('all')
  const [result, setResult] = useState<ConsolidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const CONSOLIDATION_PAGE_SIZE = 20
  const [consolidationPage, setConsolidationPage] = useState(1)

  const run = async () => {
    setLoading(true)
    setResult(null)
    setConsolidationPage(1)
    try {
      const url = `${BASE}/reports/sales-consolidation?start_date=${startDate}&end_date=${endDate}&period=${period}&group_by=${groupBy}&fuel_type=${fuelType}`
      const res = await authFetch(url, { headers: getHeaders() })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
      setResult(await res.json())
    } catch (err: any) {
      toast(err.message, { icon: '✕' })
    } finally {
      setLoading(false)
    }
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (!result) return null
    const dimLabel = result.group_by === 'attendant' ? 'Attendant' : result.group_by === 'nozzle' ? 'Nozzle' : result.group_by === 'island' ? 'Island' : result.group_by === 'tank' ? 'Tank' : null
    return {
      title: 'Sales Consolidation',
      subtitle: `${result.period.start_date} to ${result.period.end_date} — by ${result.period_type}${dimLabel ? ` / ${dimLabel}` : ''}`,
      filename: `sales_consolidation_${startDate}_${endDate}`,
      summaryCards: [
        { label: 'Total Revenue', value: fmt(result.totals.total_revenue) },
        { label: 'Volume (L)', value: result.totals.volume.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
        { label: 'Cash', value: fmt(result.totals.cash) },
        { label: 'POS', value: fmt(result.totals.pos) },
        { label: 'Credit Pre-Paid', value: fmt(result.totals.credit_prepaid) },
        { label: 'Credit Post-Paid', value: fmt(result.totals.credit_postpaid) },
      ],
      columns: [
        { header: dimLabel ? 'Period' : 'Period', key: 'label' },
        ...(dimLabel ? [{ header: dimLabel, key: 'sub_label' }] : []),
        { header: 'Volume (L)', key: 'volume', format: 'number' as const },
        { header: 'Total Revenue', key: 'total_revenue', format: 'currency' as const },
        { header: 'Cash', key: 'cash', format: 'currency' as const },
        { header: 'POS', key: 'pos', format: 'currency' as const },
        { header: 'Credit Pre-Paid', key: 'credit_prepaid', format: 'currency' as const },
        { header: 'Credit Post-Paid', key: 'credit_postpaid', format: 'currency' as const },
      ],
      data: result.rows,
    }
  }, [result, startDate, endDate])

  const showGroupDim = groupBy !== 'none'

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-content-primary">Sales Consolidation</h2>
        <p className="text-sm text-content-secondary mt-0.5">
          Fuel revenue by period and dimension, split by payment method.
          {(groupBy === 'nozzle' || groupBy === 'island' || groupBy === 'tank') && (
            <span className="ml-1 text-status-warning">Payment split is pro-rated by revenue share when grouping below attendant level.</span>
          )}
        </p>
      </div>

      {/* Controls */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs font-medium text-content-secondary mb-1.5">Period</p>
            <div className="flex gap-1">
              {[['shift','Shift'],['day','Day'],['week','Week'],['month','Month']].map(([v,l]) => segBtn(v, period, setPeriod, l))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-content-secondary mb-1.5">Group by</p>
            <div className="flex gap-1">
              {[['none','Totals only'],['attendant','Attendant'],['nozzle','Nozzle'],['island','Island'],['tank','Tank']].map(([v,l]) => segBtn(v, groupBy, setGroupBy, l))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-content-secondary mb-1.5">Fuel</p>
            <div className="flex gap-1">
              {[['all','All'],['Diesel','Diesel'],['Petrol','Petrol']].map(([v,l]) => segBtn(v, fuelType, setFuelType, l))}
            </div>
          </div>
        </div>

        <button onClick={run} disabled={loading || !startDate || !endDate || startDate > endDate}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-action-primary text-white disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportButtons getConfig={getExportConfig} />
          </div>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Revenue', val: fmt(result.totals.total_revenue), cls: 'text-action-primary' },
              { label: 'Volume (L)', val: result.totals.volume.toLocaleString(undefined, { maximumFractionDigits: 0 }), cls: 'text-content-primary' },
              { label: 'Cash', val: fmt(result.totals.cash), cls: 'text-content-primary' },
              { label: 'POS', val: fmt(result.totals.pos), cls: 'text-content-primary' },
              { label: 'Credit Pre-Paid', val: fmt(result.totals.credit_prepaid), cls: 'text-content-primary' },
              { label: 'Credit Post-Paid', val: fmt(result.totals.credit_postpaid), cls: 'text-content-primary' },
            ].map(t => (
              <div key={t.label} className="bg-surface-card border border-surface-border rounded-lg p-3">
                <p className="text-xs text-content-secondary">{t.label}</p>
                <p className={`text-base font-bold mt-0.5 ${t.cls}`}>{t.val}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-bg border-b border-surface-border">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">
                    {result.period_type === 'shift' ? 'Date / Shift' : result.period_type === 'day' ? 'Date' : result.period_type === 'week' ? 'Week' : 'Month'}
                  </th>
                  {showGroupDim && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">
                      {result.group_by === 'attendant' ? 'Attendant' : result.group_by === 'nozzle' ? 'Nozzle' : result.group_by === 'island' ? 'Island' : 'Tank'}
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary whitespace-nowrap">Vol (L)</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary whitespace-nowrap">Total Revenue</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary whitespace-nowrap">Cash</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary whitespace-nowrap">POS</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary whitespace-nowrap">Credit Pre-Paid</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary whitespace-nowrap">Credit Post-Paid</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice((consolidationPage - 1) * CONSOLIDATION_PAGE_SIZE, consolidationPage * CONSOLIDATION_PAGE_SIZE).map((row, i) => (
                  <tr key={i} className="border-t border-surface-border hover:bg-surface-bg">
                    <td className="px-4 py-2.5 text-content-primary font-medium whitespace-nowrap">
                      {row.label}
                      {result.period_type === 'shift' && row.sub_label && !showGroupDim && (
                        <span className="ml-1.5 text-xs text-content-secondary">{row.sub_label}</span>
                      )}
                    </td>
                    {showGroupDim && (
                      <td className="px-4 py-2.5 text-content-primary whitespace-nowrap">{row.sub_label}</td>
                    )}
                    <td className="px-4 py-2.5 text-right font-mono text-content-secondary">
                      {row.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-action-primary">{fmt(row.total_revenue)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(row.cash)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(row.pos)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(row.credit_prepaid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(row.credit_postpaid)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-surface-border bg-surface-bg font-semibold">
                  <td className="px-4 py-2.5 text-xs uppercase text-content-secondary" colSpan={showGroupDim ? 2 : 1}>Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-primary">
                    {result.totals.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-action-primary">{fmt(result.totals.total_revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(result.totals.cash)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(result.totals.pos)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(result.totals.credit_prepaid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(result.totals.credit_postpaid)}</td>
                </tr>
              </tbody>
            </table>
            {result.rows.length === 0 && (
              <p className="text-sm text-content-secondary text-center py-8">No completed handovers found for this period.</p>
            )}
            <Pagination total={result.rows.length} pageSize={CONSOLIDATION_PAGE_SIZE} page={consolidationPage} onPageChange={setConsolidationPage} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Analytics / Trends ──────────────────────────────────────────────────────

interface TrendRow {
  label: string
  period_key: string
  total_revenue: number
  revenue_change_pct: number | null
}

interface TrendsResult {
  rows: TrendRow[]
  period: { start_date: string; end_date: string }
  period_type: string
  fuel_type: string
}

interface TrendPoint {
  key: string
  label: string
  value: number
  changePct: number | null
}

// A single-series line chart: 2px line, ~10% opacity area wash, endpoint
// marker + direct label at the end, hairline gridlines, hover crosshair with
// a tooltip. One metric, one color — never a dual axis. A single series
// carries no legend box; the card title above it already names what's plotted.
function LineTrendChart({ points, formatValue, color = 'var(--color-action-primary)' }: {
  points: TrendPoint[]
  formatValue: (v: number) => string
  color?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 1000, H = 280
  const pad = { top: 16, right: 16, bottom: 28, left: 56 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const maxVal = Math.max(1, ...points.map(p => p.value))
  const niceMax = (() => {
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal || 1)))
    const norm = maxVal / magnitude
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
    return step * magnitude
  })()

  const x = (i: number) => (points.length <= 1 ? pad.left + innerW / 2 : pad.left + (innerW * i) / (points.length - 1))
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(p.value)}`).join(' ')
  const areaPath = points.length
    ? `M ${x(0)},${pad.top + innerH} ` +
      points.map((p, i) => `L ${x(i)},${y(p.value)}`).join(' ') +
      ` L ${x(points.length - 1)},${pad.top + innerH} Z`
    : ''

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map(f => niceMax * f)
  // Thin x-axis labels so they never collide — show at most ~8 across the width.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))

  const handleMove = (e: any) => {
    if (!points.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const idx = points.length <= 1 ? 0 : Math.round(frac * (points.length - 1))
    setHover(idx)
  }

  const last = points.length - 1
  const hoverPoint = hover !== null ? points[hover] : null

  return (
    <div className="relative">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Revenue trend chart">
        {gridTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-text-secondary)">
              {t >= 1000 ? `${Math.round(t / 1000)}K` : Math.round(t)}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          i % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">
              {p.label}
            </text>
          ) : null
        ))}

        {points.length > 0 && <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />}
        {points.length > 0 && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

        {points.length > 0 && (
          <>
            <circle cx={x(last)} cy={y(points[last].value)} r={5} fill={color} stroke="var(--color-bg-card)" strokeWidth={2} />
            <text x={x(last)} y={y(points[last].value) - 12} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--color-text-primary)">
              {formatValue(points[last].value)}
            </text>
          </>
        )}

        {hoverPoint && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH}
              stroke="var(--color-text-secondary)" strokeWidth={1} strokeDasharray="2,2" />
            <circle cx={x(hover)} cy={y(hoverPoint.value)} r={5} fill={color} stroke="var(--color-bg-card)" strokeWidth={2} />
          </g>
        )}

        {/* Hit targets: per-point focusable circles for keyboard, full-width rect for mouse */}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={12} fill="transparent"
            tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(i)} />
        ))}
        <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="transparent"
          onMouseMove={handleMove} onMouseLeave={() => setHover(null)} />
      </svg>

      {hoverPoint && hover !== null && (
        <div
          className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg shadow-lg border border-surface-border bg-surface-card text-xs"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `${(y(hoverPoint.value) / H) * 100}%`,
            transform: 'translate(-50%, -130%)',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="text-content-secondary">{hoverPoint.label}</div>
          <div className="text-content-primary font-semibold">{formatValue(hoverPoint.value)}</div>
          {hoverPoint.changePct !== null && (
            <div className={hoverPoint.changePct >= 0 ? 'text-status-success' : 'text-status-error'}>
              {hoverPoint.changePct >= 0 ? '+' : ''}{hoverPoint.changePct}% vs prior period
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnalyticsTrendsView() {
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [period, setPeriod] = useState('day')
  const [fuelType, setFuelType] = useState('all')
  const [result, setResult] = useState<TrendsResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const url = `${BASE}/reports/analytics/trends?start_date=${startDate}&end_date=${endDate}&period=${period}&fuel_type=${fuelType}`
      const res = await authFetch(url, { headers: getHeaders() })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
      setResult(await res.json())
    } catch (err: any) {
      toast(err.message, { icon: '✕' })
    } finally {
      setLoading(false)
    }
  }

  const points: TrendPoint[] = (result?.rows || []).map(r => ({
    key: r.period_key, label: r.label, value: r.total_revenue, changePct: r.revenue_change_pct,
  }))
  const latest = points.length ? points[points.length - 1] : null

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-content-primary">Analytics</h2>
        <p className="text-sm text-content-secondary mt-0.5">Revenue trend over time, with period-over-period change.</p>
      </div>

      {/* Controls — one row above the chart; every stat and table below re-renders against the same slice. */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs font-medium text-content-secondary mb-1.5">Period</p>
            <div className="flex gap-1">
              {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([v, l]) => segBtn(v, period, setPeriod, l))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-content-secondary mb-1.5">Fuel</p>
            <div className="flex gap-1">
              {[['all', 'All'], ['Diesel', 'Diesel'], ['Petrol', 'Petrol']].map(([v, l]) => segBtn(v, fuelType, setFuelType, l))}
            </div>
          </div>
        </div>

        <button onClick={run} disabled={loading || !startDate || !endDate || startDate > endDate}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-action-primary text-white disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {latest && (
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 inline-flex items-baseline gap-3">
              <div>
                <p className="text-xs text-content-secondary">Latest period revenue</p>
                <p className="text-2xl font-bold text-content-primary">{fmt(latest.value)}</p>
              </div>
              {latest.changePct !== null && (
                <span className={`text-sm font-semibold ${latest.changePct >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                  {latest.changePct >= 0 ? '+' : ''}{latest.changePct}% vs prior period
                </span>
              )}
            </div>
          )}

          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-content-primary mb-3">Total Revenue</h3>
            {points.length > 0 ? (
              <LineTrendChart points={points} formatValue={fmt} />
            ) : (
              <p className="text-sm text-content-secondary text-center py-8">No completed handovers found for this period.</p>
            )}
          </div>

          {/* Table view — every value the chart shows, reachable without hovering. */}
          {points.length > 0 && (
            <div className="bg-surface-card border border-surface-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-bg border-b border-surface-border">
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-content-secondary">Period</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary">Revenue</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-content-secondary">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={p.key || i} className="border-t border-surface-border hover:bg-surface-bg">
                      <td className="px-4 py-2.5 text-content-primary font-medium whitespace-nowrap">{p.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-content-primary">{fmt(p.value)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${
                        p.changePct === null ? 'text-content-secondary' : p.changePct >= 0 ? 'text-status-success' : 'text-status-error'
                      }`}>
                        {p.changePct === null ? '—' : `${p.changePct >= 0 ? '+' : ''}${p.changePct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Reports hub: one page, tabs (Sales / Advanced / Tank Readings / Sales Consolidation / Analytics).
const REPORT_TABS: { key: string; label: string; minRole?: string }[] = [
  { key: 'sales', label: 'Sales Reports' },
  { key: 'advanced', label: 'Advanced Reports' },
  { key: 'tank-readings', label: 'Tank Readings' },
  { key: 'consolidation', label: 'Sales Consolidation', minRole: 'manager' },
  { key: 'analytics', label: 'Analytics', minRole: 'manager' },
]

export default function ReportsHub() {
  const router = useRouter()
  const [userRole, setUserRole] = useState('')

  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (ud) setUserRole(JSON.parse(ud).role || '')
  }, [])

  const isManagerPlus = ['manager', 'owner'].includes(userRole)

  const visibleTabs = REPORT_TABS.filter(t => !t.minRole || isManagerPlus)

  const q = router.query.tab
  const active = (typeof q === 'string' && visibleTabs.some(t => t.key === q)) ? q : 'sales'

  const setTab = (key: string) => {
    router.replace(
      { pathname: '/reports', query: { ...router.query, tab: key } },
      undefined,
      { shallow: true },
    )
  }

  return (
    <div>
      <div className="bg-surface-card border-b border-surface-border px-4">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto">
          {visibleTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                active === t.key
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-content-secondary hover:text-content-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {active === 'sales' && <SalesReportsView />}
      {active === 'advanced' && <AdvancedReports />}
      {active === 'tank-readings' && <TankReadingsReport />}
      {active === 'consolidation' && isManagerPlus && <SalesConsolidationView />}
      {active === 'analytics' && isManagerPlus && <AnalyticsTrendsView />}
    </div>
  )
}
