// 把项目 / 专利 / 论文三类成果归一化成统一的条目结构，
// 供成果页列表与详情页共用，避免三套几乎相同的模板逻辑各写一遍。
//
// 条目结构：
//   { id, kind, url, title, year,
//     tags:  [{ text, tone }],      // tone: type | level | direction | status | status-done
//     meta:  [string],              // 期刊名 / 专利号 / 资助来源与周期
//     people: string,               // 作者 / 发明人
//     desc:  string,                // 列表页预览文字
//     links: [{ href, label, tone }],
//     image: string,
//     facets: [ 'key:value' ]       // 供前端筛选，与 filters 的 key 对应
//   }

function yearOf(value) {
  const match = String(value || '').match(/(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function dateRange(start, end) {
  const from = String(start || '').slice(0, 7);
  const to = String(end || '').slice(0, 7);
  if (!from) return '';
  return from + ' ~ ' + (to || '至今');
}

function uniqueOptions(items, key, labeler) {
  const seen = new Map();
  items.forEach(function (item) {
    const value = item.facetMap[key];
    if (!value) return;
    if (!seen.has(value)) seen.set(value, labeler ? labeler(value) : value);
  });
  return Array.from(seen, function (entry) { return { value: entry[0], label: entry[1] }; });
}

// 把 facets 数组同时展开成 facetMap，便于生成筛选项
function withFacetMap(item) {
  item.facetMap = {};
  item.facets.forEach(function (facet) {
    const index = facet.indexOf(':');
    item.facetMap[facet.slice(0, index)] = facet.slice(index + 1);
  });
  return item;
}

function paperItems(rows) {
  return rows.map(function (row) {
    const isConference = row.pub_type === 'conference';
    const links = [];
    const pdf = row.pdf_url || row.link || '';
    if (pdf) links.push({ href: pdf, label: '论文', tone: 'primary' });
    if (row.code_url) links.push({ href: row.code_url, label: '代码', tone: 'code' });
    if (row.doi) links.push({ href: 'https://doi.org/' + row.doi, label: 'DOI', tone: 'primary' });

    return withFacetMap({
      id: row.id,
      kind: 'paper',
      url: '/paper/' + row.id,
      title: row.title || '',
      year: Number(row.year) || yearOf(row.created_at),
      tags: [
        { text: isConference ? '会议论文' : '期刊论文', tone: 'type' },
        row.level ? { text: row.level, tone: 'level' } : null,
        row.direction ? { text: row.direction, tone: 'direction' } : null
      ].filter(Boolean),
      meta: [row.venue].filter(Boolean),
      people: row.authors || '',
      desc: row.abstract || '',
      links,
      image: row.cover_image || '',
      facets: [
        'type:' + (isConference ? 'conference' : 'journal'),
        row.direction ? 'direction:' + row.direction : ''
      ].filter(Boolean)
    });
  });
}

function patentItems(rows) {
  return rows.map(function (row) {
    return withFacetMap({
      id: row.id,
      kind: 'patent',
      url: '/patent/' + row.id,
      title: row.title || '',
      year: yearOf(row.grant_date),
      tags: [
        { text: row.kind || '发明专利', tone: 'type' },
        { text: row.status || '已授权', tone: row.status === '已授权' ? 'status' : 'status-pending' }
      ],
      meta: [row.patent_no ? '专利号 ' + row.patent_no : ''].filter(Boolean),
      people: row.inventors || '',
      desc: row.abstract || '',
      links: [],
      image: row.cover_image || '',
      facets: [
        'kind:' + (row.kind || '发明专利'),
        'status:' + (row.status || '已授权')
      ]
    });
  });
}

function projectItems(rows) {
  return rows.map(function (row) {
    const status = row.status || '进行中';
    return withFacetMap({
      id: row.id,
      kind: 'project',
      url: '/project/' + row.id,
      title: row.title || '',
      year: yearOf(row.start_date),
      tags: [
        { text: status, tone: status === '已结题' ? 'status-done' : 'status' }
      ],
      meta: [
        row.funding_source || '',
        dateRange(row.start_date, row.end_date)
      ].filter(Boolean),
      people: '',
      desc: row.description || '',
      links: [],
      image: row.cover_image || '',
      facets: ['status:' + status]
    });
  });
}

const KIND_LABELS = {
  paper: '论文',
  patent: '专利',
  project: '项目'
};

// 各段的筛选项配置：值来自实际数据，避免出现空选项
function buildFilters(kind, items) {
  if (kind === 'paper') {
    return [
      {
        key: 'type',
        allLabel: '全部类型',
        options: [
          { value: 'journal', label: '期刊论文' },
          { value: 'conference', label: '会议论文' }
        ].filter(function (option) { return items.some(function (item) { return item.facetMap.type === option.value; }); })
      },
      { key: 'direction', allLabel: '全部方向', options: uniqueOptions(items, 'direction') }
    ].filter(function (group) { return group.options.length > 0; });
  }

  if (kind === 'patent') {
    return [
      { key: 'kind', allLabel: '全部类型', options: uniqueOptions(items, 'kind') },
      { key: 'status', allLabel: '全部状态', options: uniqueOptions(items, 'status') }
    ].filter(function (group) { return group.options.length > 0; });
  }

  return [
    { key: 'status', allLabel: '全部状态', options: uniqueOptions(items, 'status') }
  ].filter(function (group) { return group.options.length > 0; });
}

// 按年份倒序分组，年份未知的排到最后
function groupByYear(items) {
  const sorted = items.slice().sort(function (a, b) {
    return (b.year || 0) - (a.year || 0) || b.id - a.id;
  });
  const groups = [];
  sorted.forEach(function (item) {
    const last = groups[groups.length - 1];
    if (last && last.year === item.year) last.items.push(item);
    else groups.push({ year: item.year, items: [item] });
  });
  return groups;
}

module.exports = {
  paperItems,
  patentItems,
  projectItems,
  buildFilters,
  groupByYear,
  KIND_LABELS
};
