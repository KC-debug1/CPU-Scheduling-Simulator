(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.SchedulerCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const algorithms = [
    { id: "rr", name: "Round Robin", shortName: "RR" },
    { id: "psjf", name: "Preemptive SJF", shortName: "P-SJF" },
    { id: "npsjf", name: "Non-Preemptive SJF", shortName: "NP-SJF" },
    { id: "ppriority", name: "Preemptive Priority", shortName: "P-PRI" },
    { id: "nppriority", name: "Non-Preemptive Priority", shortName: "NP-PRI" },
    { id: "fcfs", name: "First Come First Serve", shortName: "FCFS" },
  ];

  const sampleProcesses = [
    { id: "P1", arrival: 0, burst: 8, priority: 2 },
    { id: "P2", arrival: 1, burst: 4, priority: 1 },
    { id: "P3", arrival: 2, burst: 9, priority: 3 },
    { id: "P4", arrival: 3, burst: 5, priority: 2 },
    { id: "P5", arrival: 4, burst: 2, priority: 4 },
  ];

  function cloneProcesses(processes) {
    return processes.map((process, index) => ({
      id: process.id || `P${index + 1}`,
      arrival: Number(process.arrival),
      burst: Number(process.burst),
      priority: Number(process.priority),
      order: index,
    }));
  }

  function validateProcesses(processes) {
    const errors = [];
    if (processes.length < 3 || processes.length > 10) {
      errors.push("The number of processes must be between 3 and 10.");
    }
    processes.forEach((process, index) => {
      const label = process.id || `row ${index + 1}`;
      if (!Number.isInteger(process.arrival) || process.arrival < 0) {
        errors.push(`${label}: arrival time must be a whole number of 0 or above.`);
      }
      if (!Number.isInteger(process.burst) || process.burst <= 0) {
        errors.push(`${label}: burst time must be a whole number above 0.`);
      }
      if (!Number.isInteger(process.priority) || process.priority <= 0) {
        errors.push(`${label}: priority must be a whole number above 0.`);
      }
    });
    return errors;
  }

  function byArrivalThenOrder(a, b) {
    return a.arrival - b.arrival || a.order - b.order;
  }

  function byShortestJob(a, b) {
    return a.burst - b.burst || a.arrival - b.arrival || a.order - b.order;
  }

  function byPriority(a, b) {
    return a.priority - b.priority || a.arrival - b.arrival || a.order - b.order;
  }

  function byId(a, b) {
    const numberA = Number(String(a.id).replace(/\D/g, ""));
    const numberB = Number(String(b.id).replace(/\D/g, ""));
    return numberA - numberB || String(a.id).localeCompare(String(b.id));
  }

  function pushSegment(segments, id, start, end) {
    if (end <= start) return;
    const last = segments[segments.length - 1];
    if (last && last.id === id && last.end === start) {
      last.end = end;
      last.duration += end - start;
      return;
    }
    segments.push({ id, start, end, duration: end - start });
  }

  function buildResult(algorithm, processes, segments, completionTimes, quantum) {
    const rows = cloneProcesses(processes)
      .sort(byId)
      .map((process) => {
        const completion = completionTimes[process.id];
        const turnaround = completion - process.arrival;
        const waiting = turnaround - process.burst;
        return {
          id: process.id,
          arrival: process.arrival,
          burst: process.burst,
          priority: process.priority,
          completion,
          turnaround,
          waiting,
        };
      });
    const averageWaiting = average(rows.map((row) => row.waiting));
    const averageTurnaround = average(rows.map((row) => row.turnaround));
    const lastEnd = segments.reduce((max, segment) => Math.max(max, segment.end), 0);
    const contextSwitches = Math.max(0, segments.filter((segment) => segment.id !== "Idle").length - 1);
    const algorithmName = algorithm.id === "rr" ? `${algorithm.name} (q=${quantum})` : algorithm.name;
    return {
      algorithmId: algorithm.id,
      algorithmName,
      shortName: algorithm.shortName,
      segments,
      rows,
      averageWaiting,
      averageTurnaround,
      totalCompletionTime: lastEnd,
      contextSwitches,
    };
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function simulateFcfs(processes, quantum) {
    return simulateNonPreemptive(processes, algorithms.find((item) => item.id === "fcfs"), byArrivalThenOrder, quantum);
  }

  function simulateNonPreemptiveSjf(processes, quantum) {
    return simulateNonPreemptive(processes, algorithms.find((item) => item.id === "npsjf"), byShortestJob, quantum);
  }

  function simulateNonPreemptivePriority(processes, quantum) {
    return simulateNonPreemptive(processes, algorithms.find((item) => item.id === "nppriority"), byPriority, quantum);
  }

  function simulateNonPreemptive(processes, algorithm, picker, quantum) {
    const pending = cloneProcesses(processes).sort(byArrivalThenOrder);
    const completionTimes = {};
    const segments = [];
    let time = 0;

    while (pending.length) {
      const ready = pending.filter((process) => process.arrival <= time).sort(picker);
      if (!ready.length) {
        const nextArrival = Math.min(...pending.map((process) => process.arrival));
        pushSegment(segments, "Idle", time, nextArrival);
        time = nextArrival;
        continue;
      }

      const current = ready[0];
      const start = time;
      time += current.burst;
      pushSegment(segments, current.id, start, time);
      completionTimes[current.id] = time;
      const index = pending.findIndex((process) => process.id === current.id);
      pending.splice(index, 1);
    }

    return buildResult(algorithm, processes, segments, completionTimes, quantum);
  }

  function simulateRoundRobin(processes, quantum) {
    const algorithm = algorithms.find((item) => item.id === "rr");
    const readyQueue = [];
    const waiting = cloneProcesses(processes).sort(byArrivalThenOrder);
    const remaining = {};
    const completionTimes = {};
    const segments = [];
    let completed = 0;
    let time = 0;

    waiting.forEach((process) => {
      remaining[process.id] = process.burst;
    });

    function enqueueArrivals(upToTime) {
      while (waiting.length && waiting[0].arrival <= upToTime) {
        readyQueue.push(waiting.shift());
      }
    }

    while (completed < processes.length) {
      enqueueArrivals(time);
      if (!readyQueue.length) {
        const nextArrival = waiting[0].arrival;
        pushSegment(segments, "Idle", time, nextArrival);
        time = nextArrival;
        enqueueArrivals(time);
      }

      const current = readyQueue.shift();
      const runTime = Math.min(quantum, remaining[current.id]);
      const start = time;
      time += runTime;
      remaining[current.id] -= runTime;
      pushSegment(segments, current.id, start, time);
      enqueueArrivals(time);

      if (remaining[current.id] > 0) {
        readyQueue.push(current);
      } else {
        completionTimes[current.id] = time;
        completed += 1;
      }
    }

    return buildResult(algorithm, processes, segments, completionTimes, quantum);
  }

  function simulatePreemptiveSjf(processes, quantum) {
    const algorithm = algorithms.find((item) => item.id === "psjf");
    return simulatePreemptive(processes, algorithm, (a, b, remaining) => {
      return remaining[a.id] - remaining[b.id] || a.arrival - b.arrival || a.order - b.order;
    }, quantum);
  }

  function simulatePreemptivePriority(processes, quantum) {
    const algorithm = algorithms.find((item) => item.id === "ppriority");
    return simulatePreemptive(processes, algorithm, (a, b, remaining) => {
      return a.priority - b.priority || a.arrival - b.arrival || a.order - b.order;
    }, quantum);
  }

  function simulatePreemptive(processes, algorithm, picker, quantum) {
    const all = cloneProcesses(processes).sort(byArrivalThenOrder);
    const remaining = {};
    const completionTimes = {};
    const segments = [];
    let completed = 0;
    let time = 0;

    all.forEach((process) => {
      remaining[process.id] = process.burst;
    });

    while (completed < all.length) {
      const ready = all
        .filter((process) => process.arrival <= time && remaining[process.id] > 0)
        .sort((a, b) => picker(a, b, remaining));

      if (!ready.length) {
        const futureArrivals = all
          .filter((process) => remaining[process.id] > 0 && process.arrival > time)
          .map((process) => process.arrival);
        const nextArrival = Math.min(...futureArrivals);
        pushSegment(segments, "Idle", time, nextArrival);
        time = nextArrival;
        continue;
      }

      const current = ready[0];
      pushSegment(segments, current.id, time, time + 1);
      time += 1;
      remaining[current.id] -= 1;

      if (remaining[current.id] === 0) {
        completionTimes[current.id] = time;
        completed += 1;
      }
    }

    return buildResult(algorithm, processes, segments, completionTimes, quantum);
  }

  function simulate(processes, algorithmId, quantum) {
    const input = cloneProcesses(processes);
    const errors = validateProcesses(input);
    if (errors.length) {
      throw new Error(errors.join("\n"));
    }
    const q = Number.isInteger(quantum) && quantum > 0 ? quantum : 3;

    switch (algorithmId) {
      case "rr":
        return simulateRoundRobin(input, q);
      case "psjf":
        return simulatePreemptiveSjf(input, q);
      case "npsjf":
        return simulateNonPreemptiveSjf(input, q);
      case "ppriority":
        return simulatePreemptivePriority(input, q);
      case "nppriority":
        return simulateNonPreemptivePriority(input, q);
      case "fcfs":
        return simulateFcfs(input, q);
      default:
        throw new Error(`Unknown algorithm: ${algorithmId}`);
    }
  }

  function simulateAll(processes, quantum) {
    return algorithms.map((algorithm) => simulate(processes, algorithm.id, quantum));
  }

  return {
    algorithms,
    sampleProcesses,
    cloneProcesses,
    validateProcesses,
    simulate,
    simulateAll,
  };
});
