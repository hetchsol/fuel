import { authFetch, BASE, getHeaders, downloadExport } from '../lib/api'
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DateRangePicker from '../components/DateRangePicker';
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import AdvancedReports from './advanced-reports'
import TankReadingsReport from './tank-readings-report'
import { formatDateToDisplay } from '../lib/dateUtils'

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
                            <div className="bg-gradient-to-br from-action-primary to-action-primary p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                                <p className="text-sm text-blue-100 mb-2 font-medium uppercase tracking-wide">Total Transactions</p>
                                <p className="text-4xl font-bold text-white">
                                    {reportData.summary.total_transactions}
                                </p>
                                <p className="text-xs text-blue-200 mt-1">sales recorded</p>
                            </div>
                            <div className="bg-gradient-to-br from-status-success to-emerald-600 p-6 rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
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
                                            </tr>
                                        </thead>
                                        <tbody className="bg-surface-card divide-y divide-surface-border">
                                            {reportData.daily_breakdown.map((day, index) => (
                                                <tr key={index} className="hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 transform hover:scale-[1.01]">
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
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
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

function SalesConsolidationView() {
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [period, setPeriod] = useState('day')
  const [groupBy, setGroupBy] = useState('none')
  const [fuelType, setFuelType] = useState('all')
  const [result, setResult] = useState<ConsolidationResult | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    setResult(null)
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
                {result.rows.map((row, i) => (
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
          </div>
        </div>
      )}
    </div>
  )
}

// --- Reports hub: one page, tabs (Sales / Advanced / Tank Readings / Sales Consolidation).
const REPORT_TABS: { key: string; label: string; minRole?: string }[] = [
  { key: 'sales', label: 'Sales Reports' },
  { key: 'advanced', label: 'Advanced Reports' },
  { key: 'tank-readings', label: 'Tank Readings' },
  { key: 'consolidation', label: 'Sales Consolidation', minRole: 'manager' },
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
    </div>
  )
}
