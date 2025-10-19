<script>
  import { onMount } from 'svelte';
  
  let shutdowns = [];
  let agencyImpacts = [];
  let departmentGroups = new Map();
  let uptimePercentage = 99.9876; // Will calculate this properly
  
  // Generate months for past 30 years
  const generateMonths = () => {
    const months = [];
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear() - 30, endDate.getMonth(), 1);
    
    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        date: new Date(d)
      });
    }
    return months;
  };
  
  const months = generateMonths();
  
  // Parse CSV data
  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = values[i];
      });
      return obj;
    });
  };
  
  // Load data
  onMount(async () => {
    const [shutdownsRes, impactsRes] = await Promise.all([
      fetch('/shutdowns_full.csv'),
      fetch('/shutdown_agency_impacts_full.csv')
    ]);
    
    shutdowns = parseCSV(await shutdownsRes.text());
    agencyImpacts = parseCSV(await impactsRes.text());
    
    // Group agencies by department
    const deptMap = new Map();
    agencyImpacts.forEach(impact => {
      const dept = impact.department;
      const agency = impact.agency;
      
      if (!deptMap.has(dept)) {
        deptMap.set(dept, new Set());
      }
      deptMap.get(dept).add(agency);
    });
    
    // Convert to array format
    departmentGroups = Array.from(deptMap.entries()).map(([dept, agencies]) => ({
      name: dept,
      agencies: Array.from(agencies).filter(a => a !== `${dept} (overall)`)
    })).sort((a, b) => a.name.localeCompare(b.name));
    
    // Calculate uptime percentage
    const totalDays = 30 * 365.25;
    const shutdownDays = shutdowns.reduce((sum, s) => {
      const days = parseFloat(s.duration_days) || 0;
      return sum + days;
    }, 0);
    uptimePercentage = ((totalDays - shutdownDays) / totalDays * 100).toFixed(4);
  });
  
  // Get status for a specific month
  const getMonthStatus = (year, month, agency = null) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    
    for (const shutdown of shutdowns) {
      const start = new Date(shutdown.start_datetime_et);
      const end = shutdown.end_datetime_et ? new Date(shutdown.end_datetime_et) : new Date();
      
      // Check if shutdown overlaps with this month
      if (start <= monthEnd && end >= monthStart) {
        if (agency) {
          // Check if this agency was affected
          const impact = agencyImpacts.find(i => 
            i.shutdown_id === shutdown.shutdown_id && 
            (i.agency === agency || i.agency === `${agency} (overall)`)
          );
          if (impact) {
            return { 
              status: 'down', 
              shutdown,
              impact,
              severity: impact.furloughed_percent > 90 ? 'critical' : 
                       impact.furloughed_percent > 50 ? 'major' : 'partial'
            };
          }
        } else {
          return { status: 'down', shutdown };
        }
      }
    }
    
    return { status: 'operational' };
  };
  
  // Get color for status
  const getStatusColor = (status) => {
    if (status.status === 'operational') return 'bg-green-500';
    if (status.severity === 'critical') return 'bg-red-500';
    if (status.severity === 'major') return 'bg-orange-500';
    if (status.severity === 'partial') return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  // Format date for display
  const formatDate = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };
</script>

<div class="min-h-screen bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-5xl font-bold text-gray-900 mb-2">🇺🇸 USA Status</h1>
      <p class="text-2xl text-gray-600 mb-4">Federal Government Uptime Monitor</p>
      
      <!-- Overall Status -->
      <div class="inline-flex items-center bg-green-100 text-green-800 px-6 py-3 rounded-lg text-lg font-semibold">
        <span class="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
        All Systems Operational*
      </div>
      
      <!-- Uptime percentage -->
      <div class="mt-6">
        <p class="text-4xl font-bold text-gray-900">{uptimePercentage}%</p>
        <p class="text-sm text-gray-500">Uptime over the last 30 years</p>
        <p class="text-xs text-gray-400 mt-2">*Except when they're not</p>
      </div>
    </div>
    
    <!-- Department Status Grid -->
    <div class="space-y-6">
      {#each departmentGroups as dept}
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 class="text-xl font-semibold text-gray-900 mb-4">{dept.name}</h2>
          
          <!-- Department-wide status -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700">Department Overall</span>
              <span class="text-xs text-gray-500">30-year uptime</span>
            </div>
            <div class="flex space-x-0.5">
              {#each months as month}
                {@const status = getMonthStatus(month.year, month.month)}
                <div
                  class="flex-1 h-8 {getStatusColor(status)} opacity-80 hover:opacity-100 transition-opacity cursor-pointer relative group"
                  title={status.status === 'operational' ? 
                    `${formatDate(month.date)}: No reported shutdowns` : 
                    `${formatDate(month.date)}: ${status.shutdown.name} (${status.shutdown.duration_days} days)`}
                >
                  <!-- Tooltip on hover -->
                  <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div class="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                      {formatDate(month.date)}
                      {#if status.status === 'operational'}
                        <br>No reported shutdowns
                      {:else}
                        <br>{status.shutdown.name}
                        <br>{status.shutdown.duration_days} days
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          
          <!-- Individual agencies -->
          {#if dept.agencies.length > 0}
            <div class="border-t border-gray-200 pt-4 mt-4">
              <h3 class="text-sm font-medium text-gray-700 mb-3">Agencies</h3>
              <div class="space-y-3">
                {#each dept.agencies as agency}
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-sm text-gray-600">{agency}</span>
                    </div>
                    <div class="flex space-x-0.5">
                      {#each months as month}
                        {@const status = getMonthStatus(month.year, month.month, agency)}
                        <div
                          class="flex-1 h-6 {getStatusColor(status)} opacity-70 hover:opacity-100 transition-opacity cursor-pointer relative group"
                          title={status.status === 'operational' ? 
                            `${formatDate(month.date)}: No reported shutdowns` : 
                            `${formatDate(month.date)}: ${status.shutdown.name} - ${status.impact.metric}: ${status.impact.value}${status.impact.units}`}
                        >
                          <!-- Tooltip on hover -->
                          <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                            <div class="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                              {formatDate(month.date)}
                              {#if status.status === 'operational'}
                                <br>No reported shutdowns
                              {:else}
                                <br>{status.shutdown.name}
                                {#if status.impact.metric === 'furloughed_percent'}
                                  <br>{status.impact.value}% furloughed
                                {:else if status.impact.metric === 'status'}
                                  <br>Status: {status.impact.value}
                                {:else}
                                  <br>{status.impact.metric}: {status.impact.value} {status.impact.units}
                                {/if}
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    
    <!-- Legend -->
    <div class="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Legend</h3>
      <div class="flex flex-wrap gap-4">
        <div class="flex items-center">
          <div class="w-4 h-4 bg-green-500 rounded mr-2"></div>
          <span class="text-sm text-gray-600">Operational</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
          <span class="text-sm text-gray-600">Partial Shutdown</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-orange-500 rounded mr-2"></div>
          <span class="text-sm text-gray-600">Major Shutdown</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-red-500 rounded mr-2"></div>
          <span class="text-sm text-gray-600">Critical Shutdown</span>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-4">
        * This is a parody. Actual government operations may vary. Side effects may include: bureaucracy, red tape, and occasional functioning.
      </p>
    </div>
    
    <!-- Footer -->
    <div class="mt-8 text-center text-sm text-gray-500">
      <p>Data sources: GAO reports, Wikipedia, and various government contingency plans</p>
      <p class="mt-2">Made with 🦅 and taxpayer dollars</p>
    </div>
  </div>
</div>

<style>
  /* Add some custom styles for better hover effects */
  .group:hover .group-hover\:block {
    display: block;
  }
</style>