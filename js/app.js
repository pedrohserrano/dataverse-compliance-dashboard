const CHECK_LABELS = {
  license_cc_by_4: "CC-BY licence for non restricted data",
  restricted_terms: "Custom terms for restricted data",
  um_service_contact: "UM service contact is present",
  author_orcid: "At least one author has an ORCID",
  description_present: "Description is present",
  keywords_present: "Keywords are present",
};

const GUIDELINE_CHECKS = [
  {
    key: "license_cc_by_4",
    title: "CC-BY licence for non restricted data",
    detail: "Based on guideline point 12.1.",
  },
  {
    key: "restricted_terms",
    title: "Custom terms for restricted data",
    detail: "Based on guideline points 12.2–12.3.",
  },
  {
    key: "um_service_contact",
    title: "UM service contact is present",
    detail: "Based on guideline point 12.5; checked against approved service-contact labels in the dataset contact metadata.",
  },
  {
    key: "author_orcid",
    title: "At least one author has an ORCID",
    detailHtml:
      'It is required for discoverability and be programmatically linked to the <a href="https://cris.maastrichtuniversity.nl/" target="_blank" rel="noreferrer">CRIS system</a> for research outputs at UM.',
  },
  {
    key: "description_present",
    title: "Description is present",
    detail: "Based on section 9 of the guidelines.",
  },
  {
    key: "keywords_present",
    title: "Keywords are present",
    detail: "Based on section 9 of the guidelines.",
  },
];

const CHECK_ORDER = GUIDELINE_CHECKS.map((check) => check.key);
const MAASTRICHT_TOP_LEVELS = new Set([
  "Faculty of Psychology and Neuroscience",
  "School of Business and Economics",
  "Faculty of Health, Medicine & Life Sciences",
  "Faculty of Arts and Social Sciences",
  "Faculty of Law",
  "Faculty of Science and Engineering",
  "UNU-MERIT",
  "DataHub",
  "Maastricht UMC+",
  "Zuyderland",
  "University Library",
]);

const APPROVED_UM_SERVICE_CONTACT_LABELS = new Set([
  "data management law",
  "data steward sbe",
  "datamanagement fpn",
  "dataverse support contact",
  "dataversenl team",
  "dataversenl um contact",
  "dataversenl um-ul team",
  "faculty data manager",
  "faculty data manager fpn",
  "fasos data steward",
  "icis office",
  "law and tech lab",
  "law faculty data management services",
  "law rdm support",
  "rdm services",
  "rdm sevices",
  "rdm support fasos",
  "rdm support law",
  "rdm-roa",
  "rdm-sbe",
  "sbe faculty data steward",
  "sbe rdm",
  "sbe research data management",
  "sbe research data management (maastricht university)",
  "shedata",
  "ub dataverse",
  "ub dataverse support",
  "um admin",
  "um dataverse admin",
  "um dataverse support",
  "um dataversenl",
]);
const CHART_COLORS = {
  primary: "#001c3d",
  warning: "#D2460F",
  secondary: "#007FAD",
  text: "#333333",
  muted: "#6b7280",
  grid: "#e5e7eb",
  background: "#ffffff",
};

const IMPORT_PROTOCOL = "https://";
const IMPORT_HOST = "um-dataversenl.s3.eu-west-3.amazonaws.com";
const IMPORT_FILE = "datasets.json";
const LOCAL_DATA_URL = "data/datasets.json";
const REMOTE_IMPORT_URL = `${IMPORT_PROTOCOL}${IMPORT_HOST}/${IMPORT_FILE}`;
const DATA_LOAD_ERROR_MESSAGE =
  "Unable to load dashboard data. Please check whether the latest metadata import is available.";
const isLocalHost =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const METADATA_IMPORT_URL = isLocalHost ? LOCAL_DATA_URL : REMOTE_IMPORT_URL;

let chartInstances = [];
let allDatasets = [];
let filteredDatasets = [];
let selectedFacultyFilter = "";

async function loadDashboard() {
  try {
    const response = await fetch(METADATA_IMPORT_URL);
    if (!response.ok) {
      throw new Error(DATA_LOAD_ERROR_MESSAGE);
    }

    const payload = await response.json();
    const sourceData = normalizeDashboardSource(payload);
    const normalizedDatasets = sourceData.datasets.map(enrichDataset);
    const diagnostics = diagnoseDatasetRecords(normalizedDatasets);
    logDatasetDiagnostics(diagnostics);
    allDatasets = diagnostics.finalDatasets;
    filteredDatasets = sortDatasetsByPublicationDate(allDatasets);

    setupFacultyFilter(allDatasets);
    setupCsvExport();
    setFooterYear();
    renderOverviewImportText(sourceData.importDate);
    renderDashboard(filteredDatasets);
  } catch (error) {
    console.error("Dashboard data load failed", error);
    showError(new Error(DATA_LOAD_ERROR_MESSAGE));
  }
}

function normalizeDashboardSource(payload) {
  if (Array.isArray(payload)) {
    return {
      datasets: payload,
      importDate: null,
    };
  }

  if (payload && typeof payload === "object") {
    const importDate =
      payload.summary?.generated_at ||
      payload.summary?.import_date ||
      payload.generated_at ||
      payload.import_date ||
      payload.metadata_import_date ||
      null;

    if (Array.isArray(payload.datasets)) {
      return {
        datasets: payload.datasets,
        importDate,
      };
    }
  }

  throw new Error("Unsupported data format: expected an array or a datasets object.");
}

function enrichDataset(dataset) {
  const checks = evaluateDatasetChecks(dataset);
  const passedChecksCount = CHECK_ORDER.filter((key) => checks[key]).length;
  const checksPassedPercentage = Math.round((passedChecksCount / CHECK_ORDER.length) * 100);
  const unmetChecks = CHECK_ORDER.filter((key) => !checks[key]).map((key) => CHECK_LABELS[key]);

  return {
    ...dataset,
    checks,
    passed_checks_count: passedChecksCount,
    checks_total: CHECK_ORDER.length,
    checks_passed_ratio: passedChecksCount / CHECK_ORDER.length,
    checks_passed_percentage: checksPassedPercentage,
    unmet_checks: unmetChecks,
    missing_checks: unmetChecks,
  };
}

function diagnoseDatasetRecords(datasets) {
  const datasetRecords = datasets.filter((dataset) => isDatasetRecord(dataset));
  const uniquePersistentIds = new Set(
    datasetRecords.map((dataset) => getPersistentId(dataset)).filter(Boolean)
  );
  const uniqueDatasetIds = new Set(
    datasetRecords.map((dataset) => getDatasetIdentity(dataset, false)).filter(Boolean)
  );
  const publicationStateCounts = datasetRecords.reduce((counts, dataset) => {
    const state = getPublicationState(dataset);
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});
  const duplicatePersistentIdCount = countDuplicates(
    datasetRecords.map((dataset) => getPersistentId(dataset)).filter(Boolean)
  );
  const topLevelCounts = datasetRecords.reduce((counts, dataset) => {
    const label = (dataset.top_level_dataverse || "(missing)").trim() || "(missing)";
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
  const outsideMaastricht = datasetRecords.filter((dataset) => !isWithinMaastrichtHierarchy(dataset));
  const harvestedFieldKnown = datasetRecords.some((dataset) => hasHarvestedValue(dataset));
  const harvestedTrueCount = datasetRecords.filter((dataset) => isHarvestedRecord(dataset)).length;
  const publishedDatasets = datasetRecords.filter((dataset) => isPublishedDataset(dataset));
  const maastrichtPublishedDatasets = publishedDatasets.filter((dataset) =>
    isWithinMaastrichtHierarchy(dataset)
  );
  const nonHarvestedDatasets = maastrichtPublishedDatasets.filter(
    (dataset) => !isHarvestedRecord(dataset)
  );
  const finalDatasets = dedupeDatasets(nonHarvestedDatasets);

  return {
    totalRecords: datasets.length,
    datasetRecordCount: datasetRecords.length,
    uniquePersistentIdCount: uniquePersistentIds.size,
    uniqueDatasetIdCount: uniqueDatasetIds.size,
    publicationStateCounts,
    duplicatePersistentIdCount,
    topLevelCounts,
    outsideMaastrichtCount: outsideMaastricht.length,
    harvestedFieldKnown,
    harvestedTrueCount,
    finalCount: finalDatasets.length,
    finalDatasets,
    warnings: collectDatasetWarnings(datasetRecords),
  };
}

function evaluateDatasetChecks(dataset) {
  return {
    license_cc_by_4: passesLicenseCheck(dataset),
    restricted_terms: hasRequiredRestrictedTerms(dataset),
    um_service_contact: hasApprovedUmServiceContact(dataset),
    author_orcid: hasAuthorOrcid(dataset),
    description_present: hasDescription(dataset),
    keywords_present: hasKeywords(dataset),
  };
}

function passesLicenseCheck(dataset) {
  const license =
    dataset.license ||
    dataset.license_name ||
    dataset.terms_license ||
    dataset.termsOfUse ||
    "";

  if (!String(license).trim()) {
    return false;
  }

  return !isCc0License(license);
}

function isCc0License(value) {
  const normalized = normalizeLicense(value);

  return (
    normalized === "cc0" ||
    normalized === "cc0-1.0" ||
    normalized === "cc0 1.0" ||
    normalized.includes("cc0") ||
    normalized.includes("cc zero") ||
    normalized.includes("creative commons zero") ||
    normalized.includes("public domain dedication")
  );
}

function hasRequiredRestrictedTerms(dataset) {
  const fileRestrictionKnown = Array.isArray(dataset.files) && dataset.files.length > 0;
  const hasRestrictedFile =
    Array.isArray(dataset.files) &&
    dataset.files.some((file) => isRestrictedValue(file?.restricted) || isRestrictedValue(file?.is_restricted));
  const datasetRestricted =
    isRestrictedValue(dataset.restricted) ||
    isRestrictedValue(dataset.is_restricted) ||
    normalizeText(dataset.access_status) === "restricted";
  const isRestricted = fileRestrictionKnown ? hasRestrictedFile : datasetRestricted;

  if (!isRestricted) {
    return true;
  }

  const possibleTerms = [
    dataset.terms_of_access,
    dataset.custom_terms,
    dataset.restricted_access_terms,
    dataset.access_conditions,
  ];

  return possibleTerms.some((value) => typeof value === "string" && value.trim() !== "");
}

function hasApprovedUmServiceContact(dataset) {
  return collectContactLabels(dataset)
    .map((label) => normalizeServiceContactLabel(label))
    .some((label) => APPROVED_UM_SERVICE_CONTACT_LABELS.has(label));
}

function hasAuthorOrcid(dataset) {
  return Array.isArray(dataset.authors)
    ? dataset.authors.some(
        (author) => typeof author.orcid === "string" && author.orcid.trim() !== ""
      )
    : false;
}

function hasDescription(dataset) {
  return typeof dataset.description === "string" && dataset.description.trim() !== "";
}

function hasKeywords(dataset) {
  return Array.isArray(dataset.keywords) && dataset.keywords.length > 0;
}

function collectContactLabels(dataset) {
  const values = [];

  appendContactLabel(values, dataset.contact_name);
  appendContactLabel(values, dataset.contactName);
  appendContactLabel(values, dataset.contact);

  if (Array.isArray(dataset.contacts)) {
    dataset.contacts.forEach((contact) => {
      if (typeof contact === "string") {
        appendContactLabel(values, contact);
        return;
      }

      if (contact && typeof contact === "object") {
        appendContactLabel(values, contact.name);
        appendContactLabel(values, contact.contactName);
        appendContactLabel(values, contact.contact_name);
        appendContactLabel(values, contact.datasetContactName);
        appendContactLabel(values, contact.value);
      }
    });
  }

  if (Array.isArray(dataset.dataset_contacts)) {
    dataset.dataset_contacts.forEach((contact) => {
      if (contact && typeof contact === "object") {
        appendContactLabel(values, contact.name);
        appendContactLabel(values, contact.contact_name);
        appendContactLabel(values, contact.contactName);
        appendContactLabel(values, contact.datasetContactName);
      }
    });
  }

  const citationContacts = dataset.metadata_blocks?.citation?.datasetContact;
  if (Array.isArray(citationContacts)) {
    citationContacts.forEach((contact) => {
      if (contact && typeof contact === "object") {
        appendContactLabel(values, contact.datasetContactName);
      }
    });
  }

  return values;
}

function appendContactLabel(values, value) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = extractEmbeddedDataverseValue(value).trim();
  if (trimmed === "") {
    return;
  }

  values.push(trimmed);
}

function extractEmbeddedDataverseValue(value) {
  const match = value.match(/['"]value['"]:\s*['"]([^'"]+)['"]/);
  return match ? match[1] : value;
}

function normalizeServiceContactLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function renderDashboard(datasets) {
  filteredDatasets = sortDatasetsByPublicationDate(datasets);
  renderSummary(filteredDatasets);
  renderTable(filteredDatasets);
  renderCharts(filteredDatasets);
}

function logDatasetDiagnostics(diagnostics) {
  console.info("Dashboard dataset diagnostics", {
    totalRecords: diagnostics.totalRecords,
    datasetRecords: diagnostics.datasetRecordCount,
    uniquePersistentIds: diagnostics.uniquePersistentIdCount,
    uniqueDatasetIds: diagnostics.uniqueDatasetIdCount,
    publicationStates: diagnostics.publicationStateCounts,
    duplicatePersistentIds: diagnostics.duplicatePersistentIdCount,
    topLevelDataverses: diagnostics.topLevelCounts,
    outsideMaastrichtHierarchy: diagnostics.outsideMaastrichtCount,
    harvestedTrue: diagnostics.harvestedFieldKnown ? diagnostics.harvestedTrueCount : "field not present",
    finalUniquePublishedDatasetCount: diagnostics.finalCount,
  });

  diagnostics.warnings.forEach((warning) => {
    console.warn(warning);
  });
}

function setupFacultyFilter(datasets) {
  const select = document.getElementById("faculty-filter");
  const facultyOptions = Array.from(
    new Set(datasets.map(getFacultyValue).filter((value) => value !== ""))
  ).sort((a, b) => a.localeCompare(b));

  select.innerHTML = [
    '<option value="">All faculties</option>',
    ...facultyOptions.map(
      (faculty) => `<option value="${escapeHtml(faculty)}">${escapeHtml(faculty)}</option>`
    ),
  ].join("");

  select.addEventListener("change", () => {
    selectedFacultyFilter = select.value;
    const nextDatasets = selectedFacultyFilter
      ? allDatasets.filter((dataset) => getFacultyValue(dataset) === selectedFacultyFilter)
      : allDatasets;
    renderDashboard(nextDatasets);
  });
}

function renderSummary(datasets) {
  const datasetCount = datasets.length;
  if (!datasetCount) {
    setText("dataset-count", "0");
    setText("common-missing", "None");
    return;
  }

  const unmetCheckCounts = getUnmetCheckCounts(datasets);
  const mostCommonMissing = getMostFrequentMissingCheckLabel(unmetCheckCounts);

  setText("dataset-count", String(datasetCount));
  setText("common-missing", mostCommonMissing);
}

function renderChecksList() {
  const list = document.getElementById("checks-list");
  if (!list) {
    return;
  }
  const items = GUIDELINE_CHECKS.map(
    (check) => `
      <li>
        <strong>${escapeHtml(check.title)}</strong>
        <span class="check-detail"> &rarr; ${check.detailHtml || escapeHtml(check.detail)}</span>
      </li>
    `
  ).join("");

  list.innerHTML = items;
}

function renderTable(datasets) {
  const tableBody = document.getElementById("dataset-table-body");

  tableBody.innerHTML = datasets
    .map(
      (dataset) => `
        <tr>
          <td>${escapeHtml(dataset.title)}</td>
          <td>${escapeHtml(getFacultyValue(dataset))}</td>
          <td>${escapeHtml(formatSubdataversePathForTable(dataset))}</td>
          <td>${escapeHtml(dataset.publication_date || "")}</td>
          <td>${renderPassedChecksBadge(dataset.passed_checks_count)}</td>
          <td>${renderUnmetChecks(dataset.unmet_checks || dataset.missing_checks || [])}</td>
          <td>
            <a class="table-link" href="${encodeURI(dataset.url)}" target="_blank" rel="noreferrer">
              View dataset
            </a>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderUnmetChecks(unmetChecks) {
  if (!unmetChecks.length) {
    return '<span class="badge badge-pass">All requirements met</span>';
  }

  return `<div class="badge-list">${unmetChecks
    .map((item) => `<span class="badge badge-fail">${escapeHtml(item)}</span>`)
    .join("")}</div>`;
}

function renderPassedChecksBadge(passedChecksCount) {
  if (passedChecksCount === CHECK_ORDER.length) {
    return `<span class="badge badge-pass">${passedChecksCount}/${CHECK_ORDER.length} requirements met</span>`;
  }

  if (passedChecksCount === 0) {
    return `<span class="badge badge-fail">0/${CHECK_ORDER.length} requirements met</span>`;
  }

  return `<span class="badge badge-neutral">${passedChecksCount}/${CHECK_ORDER.length} requirements met</span>`;
}

function renderCharts(datasets) {
  disposeCharts();
  renderGauges(datasets);

  const departmentChart = echarts.init(document.getElementById("department-chart"));
  const coverageChart = echarts.init(document.getElementById("coverage-chart"));
  const departmentGroups = getDepartmentAverages(datasets).slice(0, 8);
  const departmentTooltipLabel = selectedFacultyFilter ? "Sub-dataverse" : "Faculty";
  const metCheckCounts = Object.entries(getMetCheckCounts(datasets))
    .map(([key, count]) => ({
      key,
      label: CHECK_LABELS[key],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  departmentChart.setOption({
    backgroundColor: CHART_COLORS.background,
    color: [CHART_COLORS.warning],
    animationDuration: 1050,
    animationEasing: "cubicOut",
    grid: { top: 8, right: 66, bottom: 28, left: 160, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: "#ffffff",
      borderColor: CHART_COLORS.grid,
      textStyle: { color: CHART_COLORS.text },
      formatter: (params) => {
        const dataIndex = params.find((item) => item.seriesType === "scatter")?.dataIndex ?? params[0]?.dataIndex;
        const item = departmentGroups[dataIndex];
        if (!item) {
          return "";
        }
        return [
          `${departmentTooltipLabel}: ${escapeHtml(item.label)}`,
          `Average metadata items meeting requirements: ${formatOneDecimal(item.average)} / ${CHECK_ORDER.length}`,
          `Datasets included: ${item.count}`,
        ].join("<br>");
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: CHECK_ORDER.length,
      axisLine: {
        show: false,
      },
      splitLine: {
        lineStyle: { color: CHART_COLORS.grid },
      },
      axisLabel: {
        formatter: "{value}",
        color: CHART_COLORS.muted,
        fontSize: 13,
      },
    },
    yAxis: {
      type: "category",
      data: departmentGroups.map((item) => item.label),
      inverse: true,
      axisLine: {
        lineStyle: { color: CHART_COLORS.grid },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        width: 190,
        formatter: (value) => wrapLabel(value, 24),
        color: CHART_COLORS.muted,
        fontSize: 13,
      },
    },
    series: [
      {
        name: "Average metadata items meeting requirements",
        type: "bar",
        data: departmentGroups.map((item) => Number(item.average.toFixed(1))),
        barWidth: 3,
        z: 1,
        itemStyle: {
          color: CHART_COLORS.warning,
          borderRadius: [0, 3, 3, 0],
        },
        animationDelay: (idx) => idx * 80,
      },
      {
        name: "Average metadata items meeting requirements",
        type: "scatter",
        data: departmentGroups.map((item) => Number(item.average.toFixed(1))),
        symbolSize: 14,
        z: 3,
        label: {
          show: true,
          position: "right",
          formatter: ({ value }) => formatOneDecimal(value),
          color: CHART_COLORS.primary,
          fontSize: 13,
          fontWeight: 600,
        },
        itemStyle: {
          color: CHART_COLORS.warning,
          borderColor: CHART_COLORS.background,
          borderWidth: 2,
        },
        animationDelay: (idx) => idx * 80 + 120,
      },
    ],
  });

  coverageChart.setOption({
    backgroundColor: CHART_COLORS.background,
    color: [CHART_COLORS.primary],
    animationDuration: 500,
    grid: { top: 14, right: 58, bottom: 40, left: 200, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#ffffff",
      borderColor: CHART_COLORS.grid,
      textStyle: { color: CHART_COLORS.text },
      formatter: (params) => {
        const item = metCheckCounts[params[0].dataIndex];
        return item
          ? `Metadata item: ${escapeHtml(item.label)}<br>Datasets meeting this requirement: ${params[0].value}`
          : `Datasets meeting this requirement: ${params[0].value}`;
      },
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLine: {
        show: false,
      },
      splitLine: {
        lineStyle: { color: CHART_COLORS.grid },
      },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 13,
      },
    },
    yAxis: {
      type: "category",
      data: metCheckCounts.map((item) => item.label),
      axisLine: {
        lineStyle: { color: CHART_COLORS.grid },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        width: 200,
        formatter: (value) => wrapLabel(value, 24),
        color: CHART_COLORS.muted,
        fontSize: 13,
      },
    },
    series: [
      {
        name: "Requirements met",
        type: "bar",
        data: metCheckCounts.map((item) => item.count),
        barMaxWidth: 42,
        label: {
          show: true,
          position: "right",
          formatter: "{c}",
          color: CHART_COLORS.primary,
          fontSize: 13,
          fontWeight: 700,
        },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
        },
      },
    ],
  });

  chartInstances.push(departmentChart, coverageChart);
}

function renderGauges(datasets) {
  const mostRequirementsGauge = echarts.init(document.getElementById("most-requirements-gauge"));
  const leastRequirementsGauge = echarts.init(document.getElementById("least-requirements-gauge"));
  const meetingMostRequirementsPercentage = datasets.length
    ? Math.round(
        (datasets.filter((dataset) => dataset.passed_checks_count > 4).length /
          datasets.length) *
          100
      )
    : 0;
  const meetingLeastRequirementsPercentage = datasets.length
    ? Math.round(
        (datasets.filter((dataset) => dataset.passed_checks_count < 2).length /
          datasets.length) *
          100
      )
    : 0;

  mostRequirementsGauge.setOption(makeGaugeOption(meetingMostRequirementsPercentage, CHART_COLORS.primary));
  leastRequirementsGauge.setOption(makeGaugeOption(meetingLeastRequirementsPercentage, CHART_COLORS.warning));
  chartInstances.push(mostRequirementsGauge, leastRequirementsGauge);
}

function getDepartmentAverages(datasets) {
  const groups = new Map();

  datasets.forEach((dataset) => {
    const label = selectedFacultyFilter ? getDepartmentValue(dataset) : getFacultyValue(dataset);
    if (!groups.has(label)) {
      groups.set(label, { label, totalPassed: 0, count: 0 });
    }

    const current = groups.get(label);
    current.totalPassed += dataset.passed_checks_count;
    current.count += 1;
  });

  return Array.from(groups.values())
    .map((group) => ({
      label: group.label,
      average: group.count ? group.totalPassed / group.count : 0,
      count: group.count,
    }))
    .sort((a, b) => {
      if (b.average !== a.average) {
        return b.average - a.average;
      }
      return b.count - a.count;
    });
}

function isDatasetRecord(dataset) {
  const type = normalizeText(dataset.object_type || dataset.type || "dataset");
  return type === "" || type === "dataset";
}

function getPersistentId(dataset) {
  return String(dataset.persistent_id || dataset.persistentId || "").trim();
}

function getDatasetIdentity(dataset, preferPersistentId = true) {
  const persistentId = getPersistentId(dataset);
  if (preferPersistentId && persistentId) {
    return persistentId;
  }

  const datasetId = String(dataset.dataset_id || dataset.datasetId || "").trim();
  return datasetId || persistentId;
}

function getPublicationState(dataset) {
  const state =
    dataset.publication_status ||
    dataset.publicationStatus ||
    dataset.version_state ||
    dataset.versionState ||
    dataset.latest_version_publishing_state ||
    dataset.latestVersionPublishingState;

  if (state) {
    return String(state).trim();
  }

  if (typeof dataset.published === "boolean") {
    return dataset.published ? "RELEASED" : "DRAFT";
  }

  if (typeof dataset.isReleased === "boolean") {
    return dataset.isReleased ? "RELEASED" : "DRAFT";
  }

  return "UNKNOWN";
}

function isPublishedDataset(dataset) {
  const state = normalizeText(getPublicationState(dataset));
  if (state === "released" || state === "published") {
    return true;
  }

  if (typeof dataset.published === "boolean") {
    return dataset.published;
  }

  if (typeof dataset.isReleased === "boolean") {
    return dataset.isReleased;
  }

  return false;
}

function hasHarvestedValue(dataset) {
  return typeof dataset.harvested === "boolean" || typeof dataset.isHarvested === "boolean";
}

function isHarvestedRecord(dataset) {
  return dataset.harvested === true || dataset.isHarvested === true;
}

function isWithinMaastrichtHierarchy(dataset) {
  const topLevel = String(dataset.top_level_dataverse || "").trim();
  if (topLevel !== "") {
    return MAASTRICHT_TOP_LEVELS.has(topLevel);
  }

  const rawPath =
    dataset.subdataverse_path ||
    dataset.subdataversePath ||
    dataset.dataverse_path ||
    dataset.hierarchy ||
    dataset.path;

  if (Array.isArray(rawPath)) {
    return rawPath.some((part) => String(part || "").trim() !== "");
  }

  if (typeof rawPath === "string") {
    return rawPath.trim() !== "";
  }

  return false;
}

function dedupeDatasets(datasets) {
  const byId = new Map();

  datasets.forEach((dataset) => {
    const key = getDatasetIdentity(dataset);
    if (!key) {
      console.warn("TODO: Record excluded from dashboard because it lacks persistent_id and dataset_id.");
      return;
    }

    const current = byId.get(key);
    if (!current) {
      byId.set(key, dataset);
      return;
    }

    const currentDate = Date.parse(current.publication_date || "") || 0;
    const nextDate = Date.parse(dataset.publication_date || "") || 0;
    if (nextDate > currentDate) {
      byId.set(key, dataset);
    }
  });

  return Array.from(byId.values());
}

function countDuplicates(values) {
  const counts = values.reduce((accumulator, value) => {
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});

  return Object.values(counts).filter((count) => count > 1).length;
}

function collectDatasetWarnings(datasets) {
  const warnings = [];

  if (datasets.some((dataset) => getPublicationState(dataset) === "UNKNOWN")) {
    warnings.push(
      "TODO: Some normalized records have no explicit publication-state field and are excluded from the published dataset total."
    );
  }

  if (datasets.some((dataset) => !getDatasetIdentity(dataset))) {
    warnings.push(
      "TODO: Some normalized records have neither persistent_id nor dataset_id and are excluded from the unique dataset total."
    );
  }

  if (datasets.some((dataset) => !isWithinMaastrichtHierarchy(dataset))) {
    warnings.push(
      "TODO: Some normalized records do not expose a Maastricht hierarchy field and are excluded from the final dataset total."
    );
  }

  if (!datasets.some((dataset) => hasHarvestedValue(dataset))) {
    warnings.push(
      "TODO: Harvest flags are not available on some exports; harvested dataset exclusion depends on normalized harvested fields."
    );
  }

  return warnings;
}

function getMetCheckCounts(datasets) {
  return CHECK_ORDER.reduce((counts, key) => {
    counts[key] = datasets.filter((dataset) => dataset.checks[key]).length;
    return counts;
  }, {});
}

function getUnmetCheckCounts(datasets) {
  return CHECK_ORDER.reduce((counts, key) => {
    counts[key] = datasets.filter((dataset) => !dataset.checks[key]).length;
    return counts;
  }, {});
}

function getMostFrequentMissingCheckLabel(unmetCheckCounts) {
  const sorted = Object.entries(unmetCheckCounts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] === 0) {
    return "None";
  }

  return CHECK_LABELS[sorted[0][0]];
}

function setupCsvExport() {
  const button = document.getElementById("export-csv");
  button.addEventListener("click", () => {
    if (!selectedFacultyFilter) {
      window.alert("please select a faculty to export the view");
      return;
    }

    const headers = [
      "Title",
      "Faculty",
      "Subdataverse",
      "Publication Date",
      "Requirements Met",
      "Missing Metadata Requirements",
      "Approved Service Contact Labels",
      "All Contact Labels",
      ...CHECK_ORDER.map((key) => CHECK_LABELS[key]),
      "Persistent ID",
      "URL",
    ];

    const rows = filteredDatasets.map((dataset) => [
      dataset.title,
      getFacultyValue(dataset),
      formatSubdataversePathForTable(dataset),
      dataset.publication_date || "",
      `${dataset.passed_checks_count}/${CHECK_ORDER.length} requirements met`,
      (dataset.unmet_checks || dataset.missing_checks || []).join("; "),
      getApprovedServiceContactLabels(dataset).join("; "),
      getUniqueContactLabels(dataset).join("; "),
      ...CHECK_ORDER.map((key) => dataset.checks[key]),
      dataset.persistent_id || "",
      dataset.url || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "dataversenl-metadata-requirements.csv";
    link.click();
    URL.revokeObjectURL(downloadUrl);
  });
}

function getApprovedServiceContactLabels(dataset) {
  return getUniqueContactLabels(dataset).filter((label) =>
    APPROVED_UM_SERVICE_CONTACT_LABELS.has(normalizeServiceContactLabel(label))
  );
}

function getUniqueContactLabels(dataset) {
  return Array.from(new Set(collectContactLabels(dataset)));
}

function makeGaugeOption(value, progressColor) {
  return {
    backgroundColor: CHART_COLORS.background,
    animationDuration: 500,
    series: [
      {
        type: "gauge",
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        splitNumber: 5,
        radius: "100%",
        center: ["50%", "72%"],
        axisLine: {
          lineStyle: {
            width: 18,
            color: [[1, CHART_COLORS.grid]],
          },
        },
        pointer: {
          show: false,
        },
        progress: {
          show: true,
          width: 18,
          roundCap: true,
          itemStyle: {
            color: progressColor,
          },
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          length: 12,
          distance: -22,
          lineStyle: {
            width: 2,
            color: CHART_COLORS.background,
          },
        },
        axisLabel: {
          distance: -42,
          color: CHART_COLORS.muted,
          fontSize: 11,
        },
        anchor: {
          show: false,
        },
        title: {
          show: false,
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, "-8%"],
          color: CHART_COLORS.primary,
          fontSize: 28,
          fontWeight: 700,
          formatter: "{value}%",
        },
        data: [{ value }],
      },
    ],
  };
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isRestrictedValue(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    return normalized === "true" || normalized === "restricted" || normalized === "yes" || normalized === "1";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function normalizeLicense(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_]/g, "-")
    .replace(/\s+/g, " ");
}

function getFacultyValue(dataset) {
  return (dataset.faculty_or_org || dataset.faculty || "").trim();
}

function getDepartmentValue(dataset) {
  return (
    dataset.department_or_project ||
    dataset.second_level_dataverse ||
    dataset.subdataverse ||
    "Unspecified department"
  ).trim();
}

function formatSubdataversePathForTable(dataset) {
  const rawPath =
    dataset.subdataverse_path ||
    dataset.subdataversePath ||
    dataset.dataverse_path ||
    dataset.hierarchy ||
    dataset.path;

  if (Array.isArray(rawPath) && rawPath.length > 0) {
    const cleaned = rawPath
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .filter((part) => normalizeText(part) !== "root");

    const level2AndDeeper = cleaned.slice(1);
    if (level2AndDeeper.length > 0) {
      return level2AndDeeper.join("/");
    }
  }

  if (typeof rawPath === "string" && rawPath.trim() !== "") {
    const cleaned = rawPath
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => normalizeText(part) !== "root");
    const level2AndDeeper = cleaned.slice(1);
    if (level2AndDeeper.length > 0) {
      return level2AndDeeper.join("/");
    }
  }

  return dataset.subdataverse || dataset.subdataverse_name || "";
}

function wrapLabel(value, maxCharsPerLine = 22) {
  if (!value) {
    return "";
  }

  const words = String(value)
    .replaceAll("/", "/ ")
    .replaceAll("-", "- ")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    if (`${current} ${word}`.trim().length > maxCharsPerLine) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines.join("\n");
}

function renderOverviewImportText(importDate) {
  const formattedDate = formatImportDate(importDate);
  const baseText = "Selected compliance indicators based on the latest DataverseNL metadata import.";

  setText(
    "overview-import-text",
    formattedDate ? `${baseText} (${formattedDate})` : baseText
  );
}

function formatImportDate(value) {
  if (!value) {
    return "";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const day = String(parsedDate.getDate()).padStart(2, "0");
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const year = String(parsedDate.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function sortDatasetsByPublicationDate(datasets) {
  return [...datasets].sort((a, b) => {
    const dateA = Date.parse(a.publication_date || "") || 0;
    const dateB = Date.parse(b.publication_date || "") || 0;
    return dateB - dateA;
  });
}

function formatOneDecimal(value) {
  return Number(value || 0).toFixed(1);
}

function disposeCharts() {
  chartInstances.forEach((chart) => chart.dispose());
  chartInstances = [];
}

function showError(error) {
  const panel = document.getElementById("error-panel");
  const message = document.getElementById("error-message");
  panel.classList.remove("hidden");
  message.textContent =
    error instanceof Error ? error.message : "An unexpected error occurred while loading data.";
}

function shortenTitle(title) {
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setFooterYear() {
  setText("footer-year", String(new Date().getFullYear()));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.addEventListener("resize", () => {
  chartInstances.forEach((chart) => chart.resize());
});

loadDashboard();
