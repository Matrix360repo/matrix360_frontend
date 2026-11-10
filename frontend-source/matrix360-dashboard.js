/* Signed-in dashboard presentation. Existing workspace tools own their state. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const host = $('verified'), header = $('m360-mp-topbar'), router = window.Matrix360Router;
  if (!host || !header || !router) return;

  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const stageLabel = key => key === 'unknown' ? 'Unassigned' : key.replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());
  const open = (page, anchor) => router.navigateToPage(page, anchor);
  const workspace = () => $('workspace').value;
  const number = new Intl.NumberFormat();
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  document.body.classList.add('m360-dashboard-shell');
  document.querySelector('.side').id = 'm360-workspace-rail';
  const pills = header.querySelector('.m360-mp-quick-pills');
  const menu = node('details', '', 'm360-mobile-workspace-menu');
  const menuLabel = node('summary', 'Workspace menu');
  pills.before(menu);
  menu.append(menuLabel, pills);
  pills.addEventListener('click', event => {
    if (!event.target.closest('[data-m360-goto]') || !menu.open) return;
    menu.open = false;
    const heading = $('m360-mp-active-title');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menuLabel.focus();
    }
  });

  const actions = node('div', '', 'm360-workspace-header-actions');
  actions.append($('workspace-selector-row'), $('refresh'));
  const askShortcut = node('button', 'Ask Matrix360', 'm360-overview-ask');
  askShortcut.type = 'button';
  askShortcut.addEventListener('click', () => {
    $('m360-overview-control').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('m360-control-prompt').focus({ preventScroll: true });
  });
  actions.append(askShortcut);
  header.append(actions);

  const overview = node('section');
  overview.id = 'm360-workspace-overview';
  overview.dataset.m360Page = 'dashboard';
  overview.setAttribute('aria-label', 'Workspace overview');
  overview.innerHTML = `<div class="m360-overview-metrics"></div>
    <div class="m360-overview-grid">
      <figure class="m360-overview-panel m360-pipeline-chart" aria-labelledby="m360-pipeline-chart-title">
        <figcaption class="m360-chart-header">
          <div><h2 id="m360-pipeline-chart-title">Lead activity</h2><p id="m360-pipeline-chart-summary" role="status">Loading pipeline…</p></div>
          <div class="m360-chart-switch" role="group" aria-label="Pipeline chart view">
            <button type="button" data-plot="activity" aria-pressed="true">Activity</button>
            <button type="button" data-plot="stages" aria-pressed="false">By stage</button>
          </div>
        </figcaption>
        <div id="m360-activity-plot">
          <div class="m360-activity-controls"><span>Leads added per week</span><div class="m360-chart-switch" role="group" aria-label="Lead activity period">
            <button type="button" data-weeks="4" aria-pressed="false">4 weeks</button>
            <button type="button" data-weeks="12" aria-pressed="true">12 weeks</button>
          </div></div>
          <div id="m360-activity-graph"></div>
        </div>
        <div id="m360-stage-plot" hidden>
          <ul id="m360-pipeline-chart-bars"></ul>
          <details id="m360-empty-stages" hidden><summary></summary><ul></ul></details>
        </div>
      </figure>
      <div class="m360-overview-aside">
        <figure class="m360-overview-panel" aria-labelledby="m360-mix-title">
          <figcaption><h2 id="m360-mix-title">Pipeline mix</h2><p id="m360-mix-status">Loading pipeline…</p></figcaption>
          <div id="m360-pipeline-mix" hidden>
            <div class="m360-mix-ring" aria-hidden="true"><strong></strong><span>leads</span></div>
            <ul class="m360-mix-legend" aria-label="Pipeline mix by lead count"></ul>
          </div>
        </figure>
        <section class="m360-overview-panel m360-review-panel" aria-labelledby="m360-review-title">
          <h2 id="m360-review-title">Needs your review</h2>
          <p id="m360-review-state" role="status">Checking Outreach drafts…</p><ul id="m360-review-items"></ul>
        </section>
        <section class="m360-overview-panel m360-overview-shortcuts" aria-labelledby="m360-overview-shortcuts-title">
          <h2 id="m360-overview-shortcuts-title">Quick actions</h2><div>
            <a href="?page=leads#leads" data-overview-page="leads">Open pipeline <span aria-hidden="true">↗</span></a>
            <a href="?page=research#m360-research-report" data-overview-page="research">Read saved research <span aria-hidden="true">↗</span></a>
            <a href="?page=marketing#marketing" data-overview-page="marketing">Open Outreach <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </div>
    </div>
    <div class="m360-overview-grid m360-overview-secondary">
      <figure class="m360-overview-panel" aria-labelledby="m360-sources-title">
        <figcaption><h2 id="m360-sources-title">Lead sources</h2><p id="m360-sources-status" role="status">Loading pipeline…</p></figcaption>
        <ul id="m360-source-bars" aria-label="Lead counts by source"></ul>
      </figure>
      <section class="m360-overview-panel" aria-labelledby="m360-recent-title">
        <h2 id="m360-recent-title">Recent workspace activity</h2>
        <p id="m360-recent-empty">No dated activity available yet.</p>
        <ul id="m360-recent-items"></ul>
      </section>
    </div>`;
  header.after(overview);

  function wirePageLink(link, page, anchor) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      open(page, anchor);
      const target = $(anchor.slice(1));
      const heading = target?.getClientRects().length ? target : $('m360-mp-active-title');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
  }
  for (const link of overview.querySelectorAll('[data-overview-page]')) wirePageLink(link, link.dataset.overviewPage, link.hash);

  function metric(label, caption, page, anchor) {
    const link = node('a', '', 'm360-overview-metric');
    link.href = '?page=' + page + (anchor || '');
    const value = node('strong', '—');
    link.append(node('span', label, 'm360-metric-label'), value, node('small', caption));
    wirePageLink(link, page, anchor);
    overview.querySelector('.m360-overview-metrics').append(link);
    return value;
  }
  const leadMetric = metric('Pipeline leads', 'Open pipeline', 'leads', '#leads');
  const stageMetric = metric('Active stages', 'Stages with leads', 'leads', '#leads');
  const draftMetric = metric('Awaiting approval', 'Open Outreach', 'marketing', '#marketing');
  const researchMetric = metric('Last research', 'Open report', 'research', '#m360-research-report');

  function panelDisclosure(label) {
    const details = node('details', '', 'm360-workspace-disclosure');
    details.append(node('summary', label));
    return details;
  }
  const leadList = $('lead-list'), leadSection = $('leads');
  const toolbar = node('div', '', 'm360-lead-toolbar');
  const filterLabel = node('label', 'Pipeline stage');
  const filter = node('select');
  filter.id = 'm360-pipeline-filter';
  filter.disabled = true;
  filter.add(new Option('All stages', ''));
  filterLabel.append(filter);
  toolbar.append(filterLabel);
  const searchLabel=node('label','Search leads'),search=node('input');search.type='search';search.id='m360-pipeline-search';search.placeholder='Name or contact details';searchLabel.append(search);toolbar.append(searchLabel);
  const sizeLabel=node('label','Leads per page'),pageSize=node('select');pageSize.id='m360-lead-page-size';for(const size of [5,10,25,50])pageSize.add(new Option(String(size),String(size)));pageSize.value='10';sizeLabel.append(pageSize);toolbar.append(sizeLabel);
  const sourceLabel=node('label','Lead source'),sourceFilter=node('select');sourceFilter.id='m360-source-filter';sourceFilter.add(new Option('All sources',''));sourceLabel.append(sourceFilter);toolbar.append(sourceLabel);
  leadList.before(toolbar);
  const addForm = $('add-form');
  const add = panelDisclosure('Add or import leads');
  const addTitle = addForm.previousElementSibling;
  addForm.before(add);
  if (addTitle?.tagName === 'H2') add.append(addTitle);
  add.append(addForm);
  const removePanel = $('m360-remove-leads');
  if (removePanel) {
    const manage = panelDisclosure('Bulk removal');
    add.after(manage);
    manage.append(removePanel);
  }
  function placeImport() {
    const csv = $('m360-csv-import');
    if (csv && csv.parentElement !== add) add.append(csv);
  }
  placeImport();
  new MutationObserver(placeImport).observe(leadSection, { childList: true });

  const chartSummary = $('m360-pipeline-chart-summary'), chartBars = $('m360-pipeline-chart-bars');
  const emptyStages = $('m360-empty-stages'), mix = $('m360-pipeline-mix'), mixStatus = $('m360-mix-status');
  const graph = $('m360-activity-graph'), chartTitle = $('m360-pipeline-chart-title');
  const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayLength = 86400000;
  const recent = {};
  let plot = 'activity', weeks = 4, pipeline = null, plotChosen = false, periodChosen = false;

  function setPressed(selector, key, value) {
    for (const button of overview.querySelectorAll(selector)) button.setAttribute('aria-pressed', String(button.dataset[key] === value));
  }

  overview.querySelector('.m360-pipeline-chart').addEventListener('click', event => {
    const button = event.target.closest('[data-plot], [data-weeks]');
    if (!button) return;
    if (button.dataset.plot) {
      plot = button.dataset.plot;
      plotChosen = true;
    } else {
      weeks = Number(button.dataset.weeks);
      periodChosen = true;
    }
    renderPlot();
  });

  function svgElement(tag, attrs) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    return element;
  }

  function weekBuckets(days, length, today) {
    const start = today - length * 7 + 1;
    return Array.from({ length }, (_, index) => {
      const day = start + index * 7;
      let count = 0;
      for (let offset = 0; offset < 7; offset++) count += days[day + offset] || 0;
      return { day, count };
    });
  }

  function todayNumber() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / dayLength;
  }

  function renderActivity() {
    graph.replaceChildren();
    if (!pipeline) return;
    const { creationDays = {}, total } = pipeline;
    const dated = Object.values(creationDays).reduce((sum, count) => sum + count, 0);
    if (!dated) {
      graph.append(node('p', total ? 'Lead creation dates are unavailable for this pipeline. Open By stage to see the current counts.' : 'New lead activity will appear here once records have creation dates.', 'm360-trend-empty'));
      return;
    }

    const buckets = weekBuckets(creationDays, weeks, todayNumber());
    const count = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    chartSummary.textContent = number.format(count) + (count === 1 ? ' current lead' : ' current leads') + ' added in the last ' + weeks + ' weeks.';
    if (dated < total) graph.append(node('p', 'Includes ' + number.format(dated) + ' of ' + number.format(total) + ' current leads with creation dates.'));
    if (!count) {
      graph.append(node('p', 'No dated leads fall in this period.', 'm360-trend-empty'));
      return;
    }

    const step = Math.max(1, Math.ceil(Math.max(...buckets.map(bucket => bucket.count)) / 4));
    const scale = step * 4, height = 168, width = 600;
    const svg = svgElement('svg', { viewBox: '0 0 600 170', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const defs = svgElement('defs', {});
    const gradient = svgElement('linearGradient', { id: 'm360-activity-fill', x1: '0%', y1: '100%', x2: '100%', y2: '0%' });
    gradient.append(svgElement('stop', { offset: '0%', 'stop-color': 'var(--m360-area-start)' }),
      svgElement('stop', { offset: '100%', 'stop-color': 'var(--m360-area-end)' }));
    defs.append(gradient);
    svg.append(defs);
    const yAxis = node('div', '', 'm360-trend-y-axis');
    yAxis.setAttribute('aria-hidden', 'true');
    for (let tick = 0; tick <= 4; tick++) {
      const y = 1 + height * tick / 4;
      svg.append(svgElement('line', { x1: 0, x2: width, y1: y, y2: y, class: 'm360-trend-gridline' }));
      yAxis.append(node('span', number.format(scale - step * tick)));
    }
    const points = buckets.map((bucket, i) => [
      2 + (width - 4) * i / (buckets.length - 1),
      169 - bucket.count / scale * height
    ]);
    const line = points.map(([x, y]) => x + ',' + y).join(' ');
    svg.append(
      svgElement('polygon', { points: '2,169 ' + line + ' 598,169', fill: 'url(#m360-activity-fill)', class: 'm360-trend-fill' }),
      svgElement('polyline', { points: line, fill: 'none', class: 'm360-trend-line' })
    );
    for (const [index, [x, y]] of points.entries()) {
      const mark = svgElement('circle', { cx: x, cy: y, r: buckets.length > 4 ? 3 : 4, class: 'm360-trend-point' });
      const title = svgElement('title', {});
      title.textContent = shortDate.format(buckets[index].day * dayLength) + ' · ' + number.format(buckets[index].count) + ' leads';
      mark.append(title);
      svg.append(mark);
    }

    const surface = node('div', '', 'm360-trend-surface');
    const xAxis = node('div', '', 'm360-trend-x-axis');
    xAxis.setAttribute('aria-hidden', 'true');
    for (const index of [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]) {
      const label = node('span', shortDate.format(buckets[index].day * dayLength));
      label.style.left = (100 * index / (buckets.length - 1)) + '%';
      xAxis.append(label);
    }
    surface.append(yAxis, svg, xAxis);
    const exact = node('details', '', 'm360-trend-values');
    const values = node('dl');
    for (const bucket of buckets) {
      values.append(node('dt', shortDate.formatRange(bucket.day * dayLength, (bucket.day + 6) * dayLength)),
        node('dd', number.format(bucket.count)));
    }
    exact.append(node('summary', 'View exact weekly counts'), values);
    graph.append(surface, exact);
  }

  function renderPlot() {
    const activity = plot === 'activity';
    setPressed('[data-plot]', 'plot', plot);
    setPressed('[data-weeks]', 'weeks', String(weeks));
    chartTitle.textContent = activity ? 'Lead activity' : 'Pipeline by stage';
    $('m360-activity-plot').hidden = !activity;
    $('m360-stage-plot').hidden = activity;
    if (!pipeline) return;
    const { total, active, keys } = pipeline;
    chartSummary.textContent = total
      ? number.format(total) + (total === 1 ? ' lead' : ' leads') + ' across ' + number.format(active.length) + ' of ' + number.format(keys.length) + ' stages.'
      : 'No leads in this workspace yet.';
    if (activity) renderActivity();
  }

  function updateRecent(key, timestamp, label, page, anchor, dayOnly = false) {
    if (Number.isFinite(timestamp)) recent[key] = { timestamp, label, page, anchor, dayOnly };
    else delete recent[key];
    const items = $('m360-recent-items');
    const entries = Object.values(recent).sort((a, b) => b.timestamp - a.timestamp);
    items.replaceChildren();
    $('m360-recent-empty').hidden = Boolean(entries.length);
    for (const entry of entries) {
      const item = node('li'), link = node('a', entry.label);
      const when = node('time', entry.dayOnly ? shortDate.format(entry.timestamp) : date.format(entry.timestamp));
      when.dateTime = entry.dayOnly ? new Date(entry.timestamp).toISOString().slice(0, 10) : new Date(entry.timestamp).toISOString();
      link.href = '?page=' + entry.page + entry.anchor;
      wirePageLink(link, entry.page, entry.anchor);
      item.append(link, when);
      items.append(item);
    }
  }

  function renderSources(sources, total) {
    const list = $('m360-source-bars'), status = $('m360-sources-status');
    list.replaceChildren();
    const sorted = [...sources].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (!total || !sorted.length) {
      status.textContent = total ? 'Source information is unavailable.' : 'Lead sources appear after records are added.';
      return;
    }
    status.textContent = number.format(total) + ' current leads grouped by their CRM source field.';
    const shown = sorted.length > 5
      ? [...sorted.slice(0, 4), { label: 'Remaining categories', count: sorted.slice(4).reduce((sum, item) => sum + item.count, 0) }]
      : sorted;
    const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
    for (const { label, count } of shown) {
      const item = node('li', '', 'm360-source-bar');
      const track = node('span', '', 'm360-pipeline-track'), bar = node('i');
      track.setAttribute('aria-hidden', 'true');
      bar.style.width = count / total * 100 + '%';
      track.append(bar);
      const link=node('a',label||'Unspecified');link.href='?page=leads#leads';
      link.addEventListener('click',event=>{event.preventDefault();sourceFilter.value=label==='Remaining categories'?'':label||'__none';sourceFilter.dispatchEvent(new Event('change',{bubbles:true}));open('leads','#leads');sourceFilter.focus({preventScroll:true});});
      item.append(link, node('strong', number.format(count) + ' · ' + percent.format(count / total)), track);
      list.append(item);
    }
  }

  function pipelineState(label, message) {
    pipeline = null;
    leadMetric.textContent = label;
    stageMetric.textContent = '—';
    chartSummary.textContent = message;
    mixStatus.textContent = message;
    chartBars.replaceChildren();
    emptyStages.querySelector('ul').replaceChildren();
    emptyStages.open = false;
    emptyStages.hidden = true;
    graph.replaceChildren();
    mix.hidden = true;
    mix.querySelector('.m360-mix-ring strong').textContent = '';
    mix.querySelector('ul').replaceChildren();
    $('m360-source-bars').replaceChildren();
    $('m360-sources-status').textContent = message;
    updateRecent('leads', NaN);
  }

  function stageLink(key, count) {
    const link = node('a', stageLabel(key));
    link.href = '?page=leads#leads';
    link.setAttribute('aria-label', stageLabel(key) + ', ' + number.format(count) + ' leads. Open filtered pipeline.');
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      filter.value = key;
      filter.dispatchEvent(new Event('change', { bubbles: true }));
      open('leads', '#leads');
      filter.focus({ preventScroll: true });
    });
    return link;
  }

  function renderMix(active, total) {
    mix.hidden = !total;
    mixStatus.textContent = total ? 'Share of current leads by stage' : 'No leads to break down yet.';
    if (!total) return;
    const sorted = [...active].sort((a, b) => b.count - a.count);
    const segments = sorted.length > 4
      ? [...sorted.slice(0, 3), { key: null, count: sorted.slice(3).reduce((sum, stage) => sum + stage.count, 0) }]
      : sorted;
    const ring = mix.querySelector('.m360-mix-ring'), legend = mix.querySelector('ul');
    const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
    let end = 0;
    const colors = segments.map(({ key, count }, index) => {
      const start = end;
      end += count / total * 100;
      const color = 'var(--m360-segment-' + index + ')';
      const item = node('li');
      const dot = node('i');
      dot.style.background = color;
      dot.setAttribute('aria-hidden', 'true');
      item.append(dot, key === null ? node('span', 'Other stages') : stageLink(key, count),
        node('strong', number.format(count) + ' · ' + percent.format(count / total)));
      legend.append(item);
      return color + ' ' + start + '% ' + (index === segments.length - 1 ? 100 : end) + '%';
    });
    ring.style.background = 'conic-gradient(' + colors.join(',') + ')';
    ring.querySelector('strong').textContent = number.format(total);
  }

  function renderPipeline(detail) {
    const { total, stageCounts, stages = [], creationDays = {}, sources = [] } = detail;
    const keys = [...new Set([...stages, ...Object.keys(stageCounts)])];
    const entries = keys.map(key => ({ key, count: Object.hasOwn(stageCounts, key) ? stageCounts[key] : 0 }));
    const active = entries.filter(entry => entry.count > 0);
    const selectedSource=sourceFilter.value;sourceFilter.replaceChildren(new Option('All sources',''),...sources.map(source=>new Option(source.label||'Not recorded',source.label||'__none')));sourceFilter.value=selectedSource;
    const selected = filter.value;
    filter.replaceChildren(new Option('All stages', ''), ...keys.map(stage => new Option(stageLabel(stage), stage)));
    filter.value = keys.includes(selected) ? selected : '';
    filter.disabled = !total || !keys.length;
    pipelineState(number.format(total), '');
    stageMetric.textContent = number.format(active.length);
    pipeline = { total, active, keys, creationDays };
    const today = todayNumber();
    if (!plotChosen) plot = weekBuckets(creationDays, 12, today).some(bucket => bucket.count) ? 'activity' : 'stages';
    if (!periodChosen) weeks = weekBuckets(creationDays, 4, today).some(bucket => bucket.count) ? 4 : 12;
    if (total) {
      const max = Math.max(1, ...active.map(stage => stage.count));
      const empty = emptyStages.querySelector('ul');
      for (const { key, count } of entries) {
        const row = node('li', '', 'm360-pipeline-bar');
        const track = node('span', '', 'm360-pipeline-track'), bar = node('i');
        track.setAttribute('aria-hidden', 'true');
        bar.style.width = (count / max * 100) + '%';
        track.append(bar);
        row.append(stageLink(key, count), track, node('strong', number.format(count)));
        (count ? chartBars : empty).append(row);
      }
      emptyStages.hidden = !empty.children.length;
      emptyStages.querySelector('summary').textContent = 'Show empty stages (' + empty.children.length + ')';
    }
    renderMix(active, total);
    renderSources(sources, total);
    const latestDay = Math.max(...Object.keys(creationDays).map(Number));
    if (Number.isFinite(latestDay)) {
      const count = creationDays[latestDay];
      updateRecent('leads', latestDay * dayLength, number.format(count) + (count === 1 ? ' current lead added' : ' current leads added'), 'leads', '#leads', true);
    }
    renderPlot();
  }

  const reviewItems = $('m360-review-items'), reviewState = $('m360-review-state');
  let reviewRequest = null;
  function showReviews(value, message) {
    draftMetric.textContent = Number.isSafeInteger(value) ? number.format(value) : '—';
    draftMetric.nextElementSibling.textContent = value === 'No approval access' ? 'Approval restricted' : 'Open Outreach';
    reviewState.textContent = message;
    reviewItems.replaceChildren();
  }
  async function loadReviews(ws) {
    if (!ws || ws !== workspace()) return;
    const token = sessionStorage.getItem('matrix360_pilot_token');
    if (!token || Number(sessionStorage.getItem('matrix360_pilot_expires_at')) <= Date.now()) return;
    reviewRequest?.abort();
    const request = reviewRequest = new AbortController();
    const current = () => !request.signal.aborted && reviewRequest === request && workspace() === ws &&
      sessionStorage.getItem('matrix360_pilot_token') === token;
    try {
      const result = await fetch('/api/marketing/tasks?' + new URLSearchParams({ workspace_id: ws, overview: '1' }), {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: request.signal
      });
      if (!result.ok) throw Error('Could not load drafts.');
      const data = await result.json();
      if (!current()) return;
      const latest = data.tasks.reduce((value, task) => Math.max(value, Date.parse(task.updated_at) || 0), 0);
      updateRecent('outreach', latest || NaN, 'Outreach campaign updated', 'marketing', '#marketing');
      if (!data.can_review) return showReviews('No approval access', 'Your role cannot approve Outreach drafts here.');
      const drafts = data.tasks.flatMap(task => task.review_channels.map(channel => ({ task, channel })));
      showReviews(drafts.length, drafts.length ? '' : 'No Outreach drafts are waiting for approval.');
      for (const { task, channel } of drafts) {
        const item = node('li');
        const button = node('button', '', 'm360-review-link');
        button.type = 'button';
        button.append(node('strong', channel + ' draft'), node('span', String(task.project || task.prompt || 'Outreach campaign').slice(0, 110)));
        button.addEventListener('click', () => {
          if (workspace() !== ws || sessionStorage.getItem('matrix360_pilot_token') !== token) return;
          open('marketing', '#m360-channels-section');
          document.dispatchEvent(new CustomEvent('m360:outreach-open-review', {
            detail: { workspace: ws, correlationId: task.correlation_id, channel }
          }));
        });
        item.append(button);
        reviewItems.append(item);
      }
    } catch (error) {
      if (current()) {
        updateRecent('outreach', NaN);
        showReviews('Unavailable', 'Outreach drafts could not be loaded. Open Outreach to try again.');
      }
    }
  }

  function updateCrm(event) {
    if (!event.detail?.workspace || event.detail.workspace !== workspace()) return;
    const name = $('workspace').selectedOptions[0]?.textContent || $('workspace-single-name').textContent;
    $('m360-mp-client-name').textContent = name.trim();
    if (event.detail.unavailable) pipelineState('Unavailable', 'Pipeline could not be loaded. Refresh records to retry.');
    else renderPipeline(event.detail);
    loadReviews(event.detail.workspace);
  }
  document.addEventListener('m360:crm-loaded', updateCrm);
  document.addEventListener('m360:crm-summary', updateCrm);
  document.addEventListener('m360:crm-evidence-invalidated', () => {
    filter.disabled = true;
    pipelineState('Loading…', 'Loading pipeline…');
  });
  document.addEventListener('m360:crm-unavailable', event => {
    updateCrm(event);
  });
  document.addEventListener('m360:outreach-review-updated', event => loadReviews(event.detail.workspace));
  document.addEventListener('m360:research-summary', event => {
    if (event.detail.workspace !== workspace()) return;
    const { createdAt, unavailable } = event.detail;
    researchMetric.textContent = unavailable ? 'Unavailable' : createdAt && Number.isFinite(+new Date(createdAt)) ?
      date.format(new Date(createdAt)) : 'No saved report';
    updateRecent('research', unavailable ? NaN : Date.parse(createdAt), 'Market research saved', 'research', '#m360-research-report');
  });
  function clearWorkspace() {
    search.value='';sourceFilter.replaceChildren(new Option('All sources',''));
    reviewRequest?.abort();
    reviewRequest = null;
    delete recent.research;
    delete recent.outreach;
    pipelineState('Loading…', 'Loading pipeline…');
    showReviews('Loading…', 'Checking Outreach drafts…');
    researchMetric.textContent = 'Loading…';
    filter.replaceChildren(new Option('All stages', ''));
    filter.disabled = true;
    $('m360-mp-client-name').textContent = 'Your workspace';
  }
  document.addEventListener('m360:workspace-changing', clearWorkspace);
  document.addEventListener('m360:session-ended', clearWorkspace);

  function viewLinks(page, choices, label) {
    const nav = node('nav', '', 'm360-workspace-views');
    nav.dataset.m360Page = page;
    nav.setAttribute('aria-label', label);
    for (const [name, id] of choices) {
      const link = node('a', name);
      link.href = '#' + id;
      nav.append(link);
    }
    return nav;
  }

  const copy = $('creative-studio'), image = $('m360-ai-post-studio');
  const contentViews = viewLinks('content', [
    ['Images', 'm360-ai-post-studio'], ['Copy & Email', 'creative-studio'],
    ['Reels', 'm360-reel-tools'], ['Library', 'creative-library']
  ], 'Content views');
  overview.after(contentViews);
  const reels = node('section', '', 'card');
  reels.id = 'm360-reel-tools';
  reels.dataset.m360Page = 'content';
  reels.append(node('h2', 'Reels'));
  copy.after(reels);
  for (const element of [$('m360-storyboard'), $('m360-live-motion'), $('m360-media-panel')?.closest('details') || $('m360-media-panel')]) {
    if (element) reels.append(element);
  }

  const library = $('creative-library');
  if (library) {
    const wrapper = library.parentElement;
    const archiveStatus = $('m360-archive-status');
    const archivePreview = $('m360-archive-preview');
    library.classList.add('card');
    library.dataset.m360Page = 'content';
    reels.after(library);
    for (const item of [archiveStatus, archivePreview]) if (item) library.append(item);
    if (!wrapper.children.length) wrapper.remove();
  }
  const contentGroups = {
    'm360-ai-post-studio': [image],
    'creative-studio': [copy],
    'm360-reel-tools': [reels],
    'creative-library': [library, $('m360-content-library')]
  };

  const research = $('m360-market-research');
  const researchViews = viewLinks('research', [['Saved report', 'm360-research-report'], ['Planning & calendar', 'm360-research-planning']], 'Research views');
  const planning = node('div');
  planning.id = 'm360-research-planning';
  planning.append(node('h2', 'Planning & calendar'));
  research.querySelector('h2').after(researchViews);
  research.append(planning);
  for (const tool of research.querySelectorAll('.m360-research-planning-tool')) planning.append(tool);

  function highlight(nav, id) {
    for (const link of nav.querySelectorAll('a')) {
      if (link.hash === '#' + id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  function syncViews(page, hash) {
    document.body.classList.toggle('m360-overview-page', page === 'dashboard');
    contentViews.classList.toggle('m360-secondary-hidden', page !== 'content');
    const anchor = (hash || '').slice(1);
    if (page === 'content') {
      const aliases = {
        'm360-storyboard': 'm360-reel-tools', 'm360-live-motion': 'm360-reel-tools',
        'm360-media-panel': 'm360-reel-tools', 'm360-content-library': 'creative-library',
        'm360-saved-designs': 'creative-library', creative: 'creative-studio', 'ai-post': 'm360-ai-post-studio'
      };
      const selected = Object.hasOwn(contentGroups, anchor) ? anchor : aliases[anchor] || 'm360-ai-post-studio';
      highlight(contentViews, selected);
      for (const [id, elements] of Object.entries(contentGroups)) {
        for (const element of elements) if (element) element.classList.toggle('m360-secondary-hidden', id !== selected);
      }
    }
    if (page === 'research') {
      const selected = anchor === planning.id ? planning.id : 'm360-research-report';
      highlight(researchViews, selected);
      planning.classList.toggle('m360-secondary-hidden', selected !== planning.id);
      $('m360-research-report').classList.toggle('m360-secondary-hidden', selected !== 'm360-research-report');
    }
  }
  document.addEventListener('m360:page-changed', event => syncViews(event.detail.page, event.detail.anchor));
  router.navigateToPage(router.resolveInitialPage(), location.hash, true);
  document.dispatchEvent(new Event('m360:request-crm-summary'));
})();
