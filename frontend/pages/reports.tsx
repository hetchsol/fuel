import { authFetch, BASE, getHeaders } from '../lib/api'
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

export default function Reports() {
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8 transform hover:scale-[1.01] transition-transform duration-300">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-action-primary to-indigo-600 bg-clip-text text-transparent drop-shadow-lg">
                        Sales Reports
                    </h1>
                    <p className="text-content-secondary mt-2 text-lg">
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
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                            <div className="px-8 py-6 bg-gradient-to-r from-action-primary to-indigo-600 border-b border-action-primary-hover">
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
                                                            {day.date}
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
                                    <div className="px-8 py-6 bg-gradient-to-r from-fuel-diesel to-orange-600 border-b">
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
                                    <div className="px-8 py-6 bg-gradient-to-r from-fuel-petrol to-emerald-600 border-b">
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
                                        Report generated by: <span className="text-action-primary font-bold">{reportData.generated_by.username}</span> ({reportData.generated_by.role})
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
                    <div className="bg-gradient-to-br from-surface-card to-action-primary-light rounded-2xl shadow-2xl p-16 text-center transform hover:scale-[1.02] transition-transform duration-300">
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
