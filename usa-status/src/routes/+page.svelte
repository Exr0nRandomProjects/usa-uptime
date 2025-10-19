<script>
  import { onMount, onDestroy } from 'svelte';
  import shutdownsCsv from '$lib/data/shutdowns_full.csv?raw';
  import agencyImpactsCsv from '$lib/data/shutdown_agency_impacts_full.csv?raw';
  
  let shutdowns = [];
  let agencyImpacts = [];
  let expandedDepartments = new Set();
  let currentTime = $state(new Date());
  let interval;
  
  // Generate months for past 15 years
  const generateMonths = () => {
    const months = [];
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear() - 15, endDate.getMonth(), 1);
    
    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        date: new Date(d),
        monthStart: new Date(d.getFullYear(), d.getMonth(), 1),
        monthEnd: new Date(d.getFullYear(), d.getMonth() + 1, 0)
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
  
  // Calculate uptime percentage
  const calculateUptime = (shutdownDays, totalDays) => {
    return ((totalDays - shutdownDays) / totalDays * 100).toFixed(9);
  };
  
  // Calculate shutdown days for a department (live)
  const calculateDepartmentShutdownDays = (dept, impacts) => {
    const shutdownSet = new Set();
    impacts.forEach(impact => {
      if (impact.department === dept) {
        shutdownSet.add(impact.shutdown_id);
      }
    });
    
    return Array.from(shutdownSet).reduce((sum, shutdownId) => {
      const shutdown = shutdowns.find(s => s.shutdown_id === shutdownId);
      if (shutdown) {
        if (shutdown.duration_days) {
          return sum + parseFloat(shutdown.duration_days);
        } else if (shutdown.start_datetime_et) {
          // Ongoing shutdown - calculate current duration
          const start = new Date(shutdown.start_datetime_et);
          const now = currentTime;
          const diff = now - start;
          const days = diff / (1000 * 60 * 60 * 24);
          return sum + days;
        }
      }
      return sum;
    }, 0);
  };
  
  // Calculate shutdown days for an agency (live)
  const calculateAgencyShutdownDays = (agency, impacts) => {
    const shutdownSet = new Set();
    impacts.forEach(impact => {
      if (impact.agency === agency) {
        shutdownSet.add(impact.shutdown_id);
      }
    });
    
    return Array.from(shutdownSet).reduce((sum, shutdownId) => {
      const shutdown = shutdowns.find(s => s.shutdown_id === shutdownId);
      if (shutdown) {
        if (shutdown.duration_days) {
          return sum + parseFloat(shutdown.duration_days);
        } else if (shutdown.start_datetime_et) {
          // Ongoing shutdown - calculate current duration
          const start = new Date(shutdown.start_datetime_et);
          const now = currentTime;
          const diff = now - start;
          const days = diff / (1000 * 60 * 60 * 24);
          return sum + days;
        }
      }
      return sum;
    }, 0);
  };
  
  // Parse data immediately
  shutdowns = parseCSV(shutdownsCsv);
  agencyImpacts = parseCSV(agencyImpactsCsv);
  
  console.log('Loaded shutdowns:', shutdowns);
  console.log('Sample shutdown:', shutdowns[0]);
  
  // Group agencies by department
  const deptMap = new Map();
  agencyImpacts.forEach(impact => {
    const dept = impact.department;
    const agency = impact.agency;
    
    if (!deptMap.has(dept)) {
      deptMap.set(dept, { agencies: new Set(), impacts: [] });
    }
    
    const deptData = deptMap.get(dept);
    if (agency !== `${dept} (overall)`) {
      deptData.agencies.add(agency);
    }
    deptData.impacts.push(impact);
  });
  
  // Convert to array format with static data structure
  const staticDepartmentGroups = Array.from(deptMap.entries()).map(([dept, data]) => {
    const agencies = Array.from(data.agencies);
    return {
      name: dept,
      agencies,
      impacts: data.impacts
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Reactive department groups with live uptimes
  let departmentGroups = $derived(
    staticDepartmentGroups.map(dept => {
      const deptShutdownDays = calculateDepartmentShutdownDays(dept.name, dept.impacts);
      const deptUptime = calculateUptime(deptShutdownDays, 15 * 365.25);
      
      // Calculate individual agency uptimes
      const agencyUptimes = {};
      dept.agencies.forEach(agency => {
        const agencyDays = calculateAgencyShutdownDays(agency, dept.impacts);
        agencyUptimes[agency] = calculateUptime(agencyDays, 15 * 365.25);
      });
      
      return {
        name: dept.name,
        agencies: dept.agencies,
        uptime: deptUptime,
        agencyUptimes
      };
    })
  );
  
  // Calculate live uptime percentages
  const calculateLiveUptime = () => {
    const totalDays = 15 * 365.25;
    let shutdownDays = 0;
    
    shutdowns.forEach(s => {
      if (s.duration_days) {
        // Completed shutdown
        shutdownDays += parseFloat(s.duration_days);
      } else if (s.start_datetime_et) {
        // Ongoing shutdown - calculate current duration
        const start = new Date(s.start_datetime_et);
        const now = currentTime;
        const diff = now - start;
        const days = diff / (1000 * 60 * 60 * 24);
        shutdownDays += days;
      }
    });
    
    return calculateUptime(shutdownDays, totalDays);
  };

  // Reactive global uptime
  let globalUptimePercentage = $derived(calculateLiveUptime());
  
  // Get status for a specific month
  const getMonthStatus = (monthStart, monthEnd, dept = null, agency = null) => {
    // Debug logging for global view
    if (!dept && !agency) {
      console.log('Checking global status for month:', monthStart.toISOString().substring(0, 7));
      console.log('Total shutdowns:', shutdowns.length);
    }
    
    for (const shutdown of shutdowns) {
      const start = new Date(shutdown.start_datetime_et);
      const end = shutdown.end_datetime_et ? new Date(shutdown.end_datetime_et) : new Date();
      
      // Debug log for global view
      if (!dept && !agency) {
        console.log('Shutdown:', shutdown.shutdown_id, 'Start:', start.toISOString(), 'End:', end ? end.toISOString() : 'ongoing');
      }
      
      // Check if shutdown overlaps with this month
      if (start <= monthEnd && end >= monthStart) {
        if (!dept && !agency) {
          // Global status - show any shutdown
          console.log('Found shutdown overlap for month:', monthStart.toISOString().substring(0, 7));
          return { status: 'down', shutdown, severity: 'critical' };
        } else {
          // Check if this department/agency was affected
          const impact = agencyImpacts.find(i => {
            if (i.shutdown_id !== shutdown.shutdown_id) return false;
            if (agency) return i.agency === agency;
            if (dept) return i.department === dept;
            return false;
          });
          
          if (impact) {
            return { 
              status: 'down', 
              shutdown,
              impact,
              severity: impact.furloughed_percent > 80 ? 'critical' : 
                       impact.furloughed_percent > 50 ? 'major' : 'minor'
            };
          }
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
    if (status.severity === 'minor') return 'bg-yellow-500';
    return 'bg-yellow-500';
  };
  
  // Format date for display
  const formatDate = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };
  
  // Toggle department expansion
  const toggleDepartment = (dept) => {
    if (expandedDepartments.has(dept)) {
      expandedDepartments.delete(dept);
    } else {
      expandedDepartments.add(dept);
    }
    expandedDepartments = new Set(expandedDepartments);
  };
  
  // Check if there's an ongoing shutdown
  const hasOngoingShutdown = () => {
    return shutdowns.some(s => !s.end_datetime_et);
  };
  
  // Check if a department has ongoing shutdowns affecting its agencies
  const departmentHasOngoingShutdown = (deptName) => {
    for (const shutdown of shutdowns) {
      if (!shutdown.end_datetime_et) { // ongoing shutdown
        // Check if any agency in this department is affected
        const affectedAgency = agencyImpacts.find(impact => 
          impact.shutdown_id === shutdown.shutdown_id && 
          impact.department === deptName
        );
        if (affectedAgency) {
          return true;
        }
      }
    }
    return false;
  };

  // Calculate duration for ongoing shutdowns
  const getShutdownDuration = (startDate) => {
    const start = new Date(startDate);
    const now = currentTime;
    const diff = now - start;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    const result = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    console.log('Duration calculated:', result, 'for start:', startDate);
    return result;
  };

  // Start timer for live updates
  onMount(() => {
    interval = setInterval(() => {
      currentTime = new Date();
      console.log('Timer updated:', currentTime);
    }, 30);
  });

  onDestroy(() => {
    if (interval) {
      clearInterval(interval);
    }
  });
</script>

<div class="min-h-screen bg-gray-50">
  <div class="max-w-6xl mx-auto px-4 py-6">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-gray-900 mb-2">🇺🇸 USA Status</h1>
      <p class="text-xl text-gray-600 mb-3">Federal Government Uptime Monitor*</p>
      
      <!-- Overall Status -->
      {#if hasOngoingShutdown()}
        <div class="inline-flex items-center bg-red-100 text-red-800 px-6 py-4 rounded-lg text-lg font-semibold">
          <span class="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></span>
          Government is Shut Down
        </div>
      {:else}
        <div class="inline-flex items-center bg-green-100 text-green-800 px-6 py-4 rounded-lg text-lg font-semibold">
          <span class="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
          All Systems Operational
        </div>
      {/if}
      
      <!-- Uptime percentage -->
      <div class="mt-2">
        {#if hasOngoingShutdown()}
          {@const ongoingShutdown = shutdowns.find(s => !s.end_datetime_et)}
          <p class="text-lg text-red-800 mb-2">down for {getShutdownDuration(ongoingShutdown.start_datetime_et)}</p>
        {/if}
        <p class="mt-2 text-3xl font-bold text-gray-900">{globalUptimePercentage}%</p>
        <p class="text-sm text-gray-500">Uptime over the last 15 years</p>
      </div>
    </div>
    
    <!-- Combined Status Pill -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200">
      <!-- Global US Government -->
      <div class="px-6 py-4 border-b border-gray-200">
        <div class="flex items-center justify-between mb-3">
          <span class="text-base font-medium text-gray-900">US Government</span>
          {#if hasOngoingShutdown()}
            <span class="text-sm font-medium text-red-600">Shut Down</span>
          {:else}
            <span class="text-sm font-medium text-green-600">Operational</span>
          {/if}
        </div>
        <div class="space-y-2">
          <div class="flex space-x-px">
            {#each months as month}
              {@const status = getMonthStatus(month.monthStart, month.monthEnd)}
              <div
                class="flex-1 h-5 {getStatusColor(status)} opacity-80 hover:opacity-100 transition-opacity cursor-pointer relative group"
              >
                <!-- Tooltip on hover -->
                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                  <div class="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    {formatDate(month.monthStart)}
                    {#if status.status === 'operational'}
                      <br>No shutdowns
                    {:else}
                      <br>{status.shutdown.name}
                      <br>{status.shutdown.duration_days ? `${status.shutdown.duration_days} days` : getShutdownDuration(status.shutdown.start_datetime_et)}
                    {/if}
                  </div>
                  <div class="absolute left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            {/each}
          </div>
          <div class="flex items-center text-xs text-gray-500 relative">
            <span>15 years ago</span>
            <div class="flex-1 mx-4 relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full" style="border-top: 1px solid #6b7280;"></div>
              </div>
              <div class="relative flex justify-center bg-gray-50">
                <span class="px-2 font-medium">{globalUptimePercentage}% uptime</span>
              </div>
            </div>
            <span>today</span>
          </div>
        </div>
      </div>
      
      <!-- Department Status Rows -->
      {#each departmentGroups as dept}
        <div class="border-b border-gray-200 last:border-b-0">
          <div class="px-6 py-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center">
                {#if dept.agencies.length > 1}
                  <button 
                    class="mr-2 text-gray-400 hover:text-gray-600 transition-colors"
                    on:click={() => toggleDepartment(dept.name)}
                  >
                    <svg class="w-4 h-4 transform transition-transform {expandedDepartments.has(dept.name) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                  </button>
                {/if}
                <span class="text-base font-medium text-gray-900">
                  {dept.agencies.length === 1 ? dept.agencies[0] : dept.name}
                </span>
              </div>
              {#if departmentHasOngoingShutdown(dept.name)}
                <span class="text-sm font-medium text-red-600">Shut Down</span>
              {:else}
                <span class="text-sm font-medium text-green-600">Operational</span>
              {/if}
            </div>
            <div class="space-y-2">
              <div class="flex space-x-px">
                {#each months as month}
                  {@const status = getMonthStatus(month.monthStart, month.monthEnd, dept.name)}
                  <div
                    class="flex-1 h-5 {getStatusColor(status)} opacity-70 hover:opacity-100 transition-opacity cursor-pointer relative group"
                  >
                    <!-- Tooltip on hover -->
                    <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                      <div class="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                        {formatDate(month.monthStart)}
                        {#if status.status === 'operational'}
                          <br>No shutdowns
                        {:else}
                          <br>{status.shutdown.name}
                          {#if status.impact && status.impact.metric === 'furloughed_percent'}
                            <br>{status.impact.value}% furloughed
                          {/if}
                        {/if}
                      </div>
                      <div class="absolute left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                {/each}
              </div>
              <div class="flex items-center text-xs text-gray-500 relative">
                <span>15 years ago</span>
                <div class="flex-1 mx-4 relative">
                  <div class="absolute inset-0 flex items-center">
                    <div class="w-full" style="border-top: 1px solid #6b7280;"></div>
                  </div>
                  <div class="relative flex justify-center bg-white">
                    <span class="px-2 font-medium">
                      {dept.agencies.length === 1 ? dept.agencyUptimes[dept.agencies[0]] : dept.uptime}% uptime
                    </span>
                  </div>
                </div>
                <span>today</span>
              </div>
            </div>
            
            <!-- Expanded agencies -->
            {#if dept.agencies.length > 1 && expandedDepartments.has(dept.name)}
              <div class="mt-3 space-y-2">
                {#each dept.agencies as agency}
                  <div class="pl-6">
                    <div class="flex items-center justify-between mb-1">
                      <div>
                        <span class="text-sm text-gray-700">{agency}</span>
                        <span class="ml-2 text-sm text-gray-500">{dept.agencyUptimes[agency]}%</span>
                      </div>
                    </div>
                    <div class="flex space-x-px">
                      {#each months as month}
                        {@const status = getMonthStatus(month.monthStart, month.monthEnd, null, agency)}
                        <div
                          class="flex-1 h-4 {getStatusColor(status)} opacity-60 hover:opacity-100 transition-opacity cursor-pointer relative group"
                        >
                          <!-- Tooltip on hover -->
                          <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                            <div class="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                              {formatDate(month.monthStart)}
                              {#if status.status === 'operational'}
                                <br>No shutdowns
                              {:else}
                                <br>{status.shutdown.name}
                                {#if status.impact && status.impact.metric === 'furloughed_percent'}
                                  <br>{status.impact.value}% furloughed
                                {:else if status.impact && status.impact.metric === 'status'}
                                  <br>Status: {status.impact.value}
                                {/if}
                              {/if}
                            </div>
                            <div class="absolute left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    
    <!-- Legend -->
    <div class="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4">
      <div class="flex flex-wrap gap-6 text-sm">
        <div class="flex items-center">
          <div class="w-3 h-3 bg-green-500 rounded mr-2"></div>
          <span class="text-gray-600">Operational</span>
        </div>
        <div class="flex items-center">
          <div class="w-3 h-3 bg-yellow-500 rounded mr-2"></div>
          <span class="text-gray-600">Minor Shutdown</span>
        </div>
        <div class="flex items-center">
          <div class="w-3 h-3 bg-orange-500 rounded mr-2"></div>
          <span class="text-gray-600">Major Shutdown (>50%)</span>
        </div>
        <div class="flex items-center">
          <div class="w-3 h-3 bg-red-500 rounded mr-2"></div>
          <span class="text-gray-600">Critical Shutdown (>80%)</span>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="mt-6 text-center text-xs text-gray-500">
      <p>* Not an official service of the United States of America. Your tax dollars at rest.</p>
    </div>
  </div>
</div>

<style>
  /* Custom hover styles */
  .group:hover .group-hover\:block {
    display: block;
  }
</style>