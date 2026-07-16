import { PublicPrompt } from '@/types'

const publishedAt = '2026-05-26T00:00:00.000Z'

type ChinesePromptSpec = {
  title: string
  description: string
  category: string
  tags: string[]
  role: string
  inputLabel: string
  deliverables: string[]
  rules: string[]
}

const chinesePromptSpecs: ChinesePromptSpec[] = [
  { title: '战略复盘简报', description: '把业务复盘材料整理成目标、结果、偏差、原因和下一步动作。', category: '战略', tags: ['战略', '复盘', '经营分析'], role: '资深战略运营顾问', inputLabel: '复盘背景和业务数据', deliverables: ['目标与实际结果对比', '关键偏差', '原因假设', '经验沉淀', '下一阶段行动清单'], rules: ['区分事实和判断。', '不要编造数据。', '行动建议必须可执行。'] },
  { title: '产品需求澄清器', description: '把模糊产品想法转成问题、用户、边界、验收标准和风险。', category: '产品', tags: ['产品需求', 'PRD', '验收标准'], role: '资深产品经理', inputLabel: '产品想法和用户场景', deliverables: ['问题定义', '目标用户', '核心流程', '功能边界', '验收标准', '风险与依赖'], rules: ['优先明确用户问题。', '需求必须可验证。', '标出待确认假设。'] },
  { title: '代码审查清单', description: '从正确性、安全、性能、可维护性和测试覆盖审查代码。', category: '研发', tags: ['代码审查', '工程质量', '测试'], role: '务实的高级软件工程师', inputLabel: '代码或 diff', deliverables: ['严重问题', '安全风险', '性能隐患', '可维护性建议', '缺失测试', '优先修复清单'], rules: ['问题按严重程度排序。', '每个结论给出证据。', '没有阻塞问题时明确说明。'] },
  { title: '竞品定位分析', description: '比较竞品的人群、承诺、证据、价格和差异化机会。', category: '市场', tags: ['竞品分析', '定位', '市场'], role: '市场定位分析师', inputLabel: '市场和竞品资料', deliverables: ['竞品对比表', '定位空白', '差异化角度', '信息缺口', '验证实验'], rules: ['只使用已提供信息。', '事实和推断分开写。', '指出证据薄弱处。'] },
  { title: '用户访谈洞察', description: '从访谈记录提取任务、痛点、原话、机会和后续问题。', category: '用户研究', tags: ['用户访谈', '洞察', 'UX'], role: '用户研究专家', inputLabel: '访谈记录', deliverables: ['用户背景', '任务与动机', '痛点分级', '关键原话', '机会点', '后续问题'], rules: ['不要从单个用户过度推广。', '观察和解释分开。', '低置信度结论要标注。'] },
  { title: '数据分析计划', description: '先定义假设、指标、分群、字段和解释风险，再做分析。', category: '数据', tags: ['数据分析', '指标', '实验'], role: '数据分析师', inputLabel: '业务问题和可用数据', deliverables: ['分析假设', '核心指标', '分群口径', '所需字段', '查询思路', '解释风险'], rules: ['警惕相关不等于因果。', '优先指出缺失数据。', '指标要服务决策。'] },
  { title: '会议行动转化器', description: '把会议纪要转成决议、负责人、截止时间、风险和跟进消息。', category: '运营', tags: ['会议', '行动项', '项目管理'], role: '运营负责人', inputLabel: '会议纪要', deliverables: ['已确认决议', '开放问题', '行动项表格', '风险与阻塞', '会后同步消息'], rules: ['缺负责人或时间要标注。', '行动项不要埋在段落里。', '跟进消息要简洁。'] },
  { title: '风险登记表生成器', description: '为项目生成概率、影响、预警信号、缓解方案和负责人。', category: '项目管理', tags: ['风险', '项目', '管理'], role: '项目风险经理', inputLabel: '项目背景', deliverables: ['风险登记表', '前三大风险', '缓解方案', '应急预案', '负责人建议'], rules: ['覆盖技术、运营、商业和合规风险。', '缓解方案要具体。', '优先级要说明理由。'] },
  { title: '落地页文案系统', description: '生成转化导向的标题、卖点、异议处理、CTA 和页面结构。', category: '营销', tags: ['落地页', '文案', '转化'], role: '增长文案专家', inputLabel: '产品、用户和报价信息', deliverables: ['主标题', '副标题', '核心卖点', '功能收益表', '异议处理', 'CTA', '页面结构'], rules: ['避免空泛夸张。', '用客户语言表达。', '每个主张尽量具体。'] },
  { title: '内容选题简报', description: '生成搜索意图、内容角度、大纲、案例和质量标准。', category: '内容', tags: ['内容策略', 'SEO', '写作'], role: '内容策略师', inputLabel: '主题、受众和目标', deliverables: ['搜索意图', '读者承诺', '差异化角度', '文章大纲', '案例建议', '质量检查表'], rules: ['优先有用性。', '避免关键词堆砌。', '角度必须具体。'] },
  { title: '冷邮件序列', description: '写一组尊重用户时间的外呼邮件，突出相关性、痛点和下一步。', category: '销售', tags: ['销售', '冷邮件', '外呼'], role: 'B2B 销售策略师', inputLabel: '潜在客户背景和产品价值', deliverables: ['首封邮件', '第一次跟进', '第二次跟进', '标题选项', '个性化建议'], rules: ['不要过度承诺。', '每封邮件要短。', '先讲相关性，再讲功能。'] },
  { title: '销售异议处理手册', description: '把常见异议整理成回应话术、证据和追问问题。', category: '销售', tags: ['异议处理', '销售赋能', 'B2B'], role: '销售赋能负责人', inputLabel: '客户异议和产品上下文', deliverables: ['异议分类', '回应话术', '证据点', '诊断问题', '后续动作'], rules: ['先承认顾虑。', '避免防御性表达。', '用问题澄清真实阻力。'] },
  { title: '客户支持回复', description: '写出有同理心、准确、可执行的客服回复和升级标准。', category: '客服', tags: ['客服', '客户成功', '沟通'], role: '客户支持专家', inputLabel: '客户问题和政策边界', deliverables: ['客户回复', '内部备注', '排查步骤', '升级标准', '后续跟进'], rules: ['不要未经确认就承认责任。', '用清楚语言。', '给客户明确下一步。'] },
  { title: '流失风险分析', description: '根据客户行为和账户记录分析健康度并给出保留动作。', category: '客户成功', tags: ['流失', '留存', '客户成功'], role: '客户成功经理', inputLabel: '客户使用数据和账户记录', deliverables: ['风险诊断', '健康度理由', '保留动作', '升级建议', '沟通话术'], rules: ['行动必须对应证据。', '区分产品问题和关系问题。', '优先高杠杆动作。'] },
  { title: '招聘画像计分卡', description: '定义岗位使命、90 天成果、能力证据和面试信号。', category: '招聘', tags: ['招聘', '面试', '计分卡'], role: '结构化招聘顾问', inputLabel: '岗位描述和团队背景', deliverables: ['岗位使命', '90 天成果', '核心能力', '证据标准', '红旗信号'], rules: ['标准必须可观察。', '避免性格刻板印象。', '区分必须项和加分项。'] },
  { title: '面试题库生成器', description: '根据岗位成果生成行为问题、追问和评分 Rubric。', category: '招聘', tags: ['面试题', '招聘', 'Rubric'], role: '面试设计专家', inputLabel: '岗位计分卡或要求', deliverables: ['行为问题', '工作样本题', '追问问题', '评分标准', '证据记录表'], rules: ['要求真实经历证据。', '避免引导性问题。', '评分口径一致。'] },
  { title: 'SOP 标准流程', description: '把重复流程整理成目的、范围、步骤、检查点和异常处理。', category: '运营', tags: ['SOP', '流程', '运营'], role: '流程优化顾问', inputLabel: '流程记录', deliverables: ['目的', '适用范围', '步骤清单', '质量检查', '异常处理', '责任分工'], rules: ['使用编号步骤。', '交接点要明确。', '写出失败场景。'] },
  { title: '事故复盘报告', description: '生成无责复盘，包括时间线、影响、根因和改进行动。', category: '研发', tags: ['事故复盘', '可靠性', '工程'], role: '可靠性工程负责人', inputLabel: '事故时间线和记录', deliverables: ['摘要', '用户影响', '时间线', '根因', '改进行动', '负责人表'], rules: ['保持无责。', '区分检测、缓解和预防。', '行动要可衡量。'] },
  { title: '安全威胁建模', description: '识别资产、信任边界、威胁场景、控制措施和残余风险。', category: '安全', tags: ['安全', '威胁建模', '风险'], role: '应用安全架构师', inputLabel: '系统或功能描述', deliverables: ['资产清单', '信任边界', '威胁场景', '缓解措施', '残余风险'], rules: ['覆盖认证、数据泄露、滥用和运维风险。', '按可能性和影响排序。', '避免夸大。'] },
  { title: '隐私检查清单', description: '审查数据收集、留存、同意、共享和用户控制。', category: '安全', tags: ['隐私', '合规', '数据'], role: '隐私产品顾问', inputLabel: '功能和数据流', deliverables: ['数据清单', '用途映射', '留存风险', '用户控制', '待确认问题'], rules: ['最小化收集。', '识别敏感字段。', '标出同意不清楚处。'] },
  { title: '架构决策记录', description: '写 ADR，包含背景、方案、决策、后果和后续任务。', category: '研发', tags: ['架构', 'ADR', '决策'], role: '软件架构师', inputLabel: '技术决策背景', deliverables: ['背景', '备选方案', '最终决策', '影响与代价', '后续任务'], rules: ['公平呈现备选方案。', '明确权衡。', '说明可逆性。'] },
  { title: '重构计划', description: '制定低风险重构路径，包含范围、顺序、测试和回滚。', category: '研发', tags: ['重构', '代码质量', '测试'], role: '资深工程负责人', inputLabel: '代码问题和重构目标', deliverables: ['当前问题', '目标结构', '分步计划', '测试策略', '回滚方案'], rules: ['行为变化和结构调整分开。', '降低影响面。', '列出验证点。'] },
  { title: '设计走查助手', description: '从层级、清晰度、可访问性、一致性和转化阻力审查界面。', category: '设计', tags: ['设计评审', 'UX', '可访问性'], role: '产品设计评审专家', inputLabel: '设计说明或截图描述', deliverables: ['主要可用性问题', '可访问性风险', '视觉层级建议', '文案优化', '优先修复项'], rules: ['按用户影响排序。', '建议必须具体。', '少谈个人偏好。'] },
  { title: '用户故事地图', description: '把功能想法拆成用户活动、故事、MVP 切片和发布顺序。', category: '产品', tags: ['用户故事', '路线图', '产品'], role: '敏捷产品教练', inputLabel: '产品想法或功能 brief', deliverables: ['用户活动', '故事地图', 'MVP 切片', '验收标准', '发布顺序'], rules: ['聚焦用户结果。', '故事要可测试。', '识别依赖。'] },
  { title: 'KPI 指标树', description: '把业务目标拆成北极星指标、驱动因素和埋点需求。', category: '数据', tags: ['KPI', '指标', '分析'], role: '增长数据负责人', inputLabel: '业务目标和上下文', deliverables: ['北极星指标', '驱动树', '领先指标', '埋点缺口', '复盘节奏'], rules: ['避免虚荣指标。', '定义每个指标。', '指标要连接决策。'] },
  { title: '仪表盘需求说明', description: '定义仪表盘用户、决策、指标、筛选器、预警和数据口径。', category: '数据', tags: ['仪表盘', 'BI', '指标'], role: 'BI 产品经理', inputLabel: '仪表盘目标和使用者', deliverables: ['用户决策', '指标定义', '布局建议', '筛选器', '预警规则', '数据 caveat'], rules: ['为决策设计。', '说明刷新频率。', '标出模糊指标。'] },
  { title: '合同条款解释器', description: '用普通话解释合同条款的义务、风险和谈判问题。', category: '法务运营', tags: ['合同', '法务', '风险'], role: '法务运营助手', inputLabel: '合同条款文本', deliverables: ['白话摘要', '主要义务', '风险点', '咨询律师的问题', '谈判点'], rules: ['不提供法律意见。', '保留不确定性。', '高风险条款建议专业复核。'] },
  { title: '项目申请书大纲', description: '整理项目背景、影响、方法、预算理由和评估计划。', category: '写作', tags: ['申请书', '提案', '项目'], role: '项目提案写作顾问', inputLabel: '项目机会和项目说明', deliverables: ['提案大纲', '影响论证', '方法摘要', '预算理由', '评估计划'], rules: ['对齐评审重点。', '影响要可衡量。', '不要编造资质。'] },
  { title: '文献综述矩阵', description: '把论文按主题、方法、发现、局限和研究空白整理。', category: '研究', tags: ['文献综述', '研究', '论文'], role: '学术研究助理', inputLabel: '论文摘要或阅读笔记', deliverables: ['主题地图', '方法对比', '发现矩阵', '局限', '研究空白'], rules: ['不编造引用。', '公平呈现分歧。', '总结和评价分开。'] },
  { title: '播客节目策划', description: '规划一期播客的主线、嘉宾问题、段落和传播切片。', category: '内容', tags: ['播客', '内容', '访谈'], role: '播客内容策划', inputLabel: '节目主题和嘉宾背景', deliverables: ['节目论点', '段落安排', '问题清单', '传播切片', 'show notes'], rules: ['形成清晰叙事线。', '问题开放。', '避免重复提问。'] },
  { title: '短视频脚本蓝图', description: '生成短视频或长视频的开头、节奏、画面和 CTA。', category: '内容', tags: ['视频', '脚本', '创作者'], role: '视频脚本策划', inputLabel: '视频主题和受众', deliverables: ['开头钩子', '脚本节奏', '画面建议', '留存设计', 'CTA'], rules: ['价值前置。', '使用具体例子。', '画面建议要可执行。'] },
  { title: '品牌语气指南', description: '定义品牌语气原则、词汇、禁用表达和示例文案。', category: '品牌', tags: ['品牌语气', '文案', '风格指南'], role: '品牌策略文案', inputLabel: '品牌背景和样本文案', deliverables: ['语气原则', '语气光谱', '推荐词汇', '前后对比例子', '样本文案'], rules: ['基于样本总结。', '避免泛泛形容词。', '规则要便于执行。'] },
  { title: '定价页诊断', description: '优化定价页清晰度、套餐差异、异议处理和转化流程。', category: '营销', tags: ['定价', '转化', 'SaaS'], role: 'SaaS 增长顾问', inputLabel: '定价页文案或套餐说明', deliverables: ['清晰度问题', '套餐定位', '异议处理', 'CTA 改进', '测试建议'], rules: ['建议要连接购买决策。', '避免虚假紧迫感。', '套餐差异要明显。'] },
  { title: '新手引导审计', description: '审查 onboarding 的激活点、阻力、空状态和成功时刻。', category: '产品', tags: ['Onboarding', '激活', 'UX'], role: '增长产品经理', inputLabel: '新手引导流程说明', deliverables: ['阻力点', '激活时刻', '空状态改进', '度量方案', '优先修复项'], rules: ['围绕首次价值优化。', '不要增加无必要步骤。', '结果要可衡量。'] },
  { title: '邮件通讯草稿', description: '写一封有用的 newsletter，包括标题、开头、板块和 CTA。', category: '内容', tags: ['Newsletter', '邮件', '写作'], role: '邮件内容编辑', inputLabel: '主题笔记和受众', deliverables: ['标题选项', '开头', '主要板块', '读者收获', 'CTA'], rules: ['尊重读者时间。', '结构便于浏览。', 'CTA 低摩擦。'] },
  { title: '社区公告润色', description: '把社区公告改写得清晰、尊重、可执行并符合规则。', category: '社区', tags: ['社区', '公告', '审核'], role: '社区运营负责人', inputLabel: '社区更新或管理背景', deliverables: ['润色公告', '语气说明', '风险提示', 'FAQ 追问'], rules: ['避免激化表达。', '下一步要明确。', '保留重要规则细节。'] },
  { title: '测验题生成器', description: '生成考察记忆、应用、误区和深层理解的题目。', category: '教育', tags: ['测验', '学习', '评估'], role: '教学评估设计师', inputLabel: '课程内容或主题', deliverables: ['选择题', '简答题', '答案解析', '常见误区', '难度分级'], rules: ['考理解而不是冷知识。', '解释正确答案。', '难度要有层次。'] },
  { title: '课程模块规划', description: '规划课程模块的成果、教学流程、活动、评估和资源。', category: '教育', tags: ['课程设计', '教学', '大纲'], role: '课程设计专家', inputLabel: '课程主题和学习者背景', deliverables: ['学习成果', '课程顺序', '课堂活动', '评估方式', '资源清单'], rules: ['成果可衡量。', '包含主动练习。', '匹配学习者水平。'] },
  { title: '个人效率系统', description: '围绕优先级、精力、日历和周复盘设计轻量效率系统。', category: '效率', tags: ['效率', '规划', '工作流'], role: '个人效率教练', inputLabel: '当前工作量和约束', deliverables: ['优先级规则', '周复盘模板', '每日计划流程', '自动化建议', '失效恢复方案'], rules: ['系统要简单。', '尊重现实约束。', '偏好能在忙碌时坚持的习惯。'] },
  { title: '决策日志模板', description: '记录决策背景、选项、信心、假设和复盘时间。', category: '效率', tags: ['决策', '复盘', '学习'], role: '决策教练', inputLabel: '决策背景', deliverables: ['决策陈述', '备选项', '关键假设', '信心评分', '复盘标准', '复盘日期'], rules: ['预测要明确。', '情绪和证据分开。', '定义如何复盘。'] },
  { title: '高管一页纸', description: '把复杂事项压缩成一页摘要，突出请求、影响和权衡。', category: '战略', tags: ['高管摘要', '一页纸', '战略'], role: '高管沟通顾问', inputLabel: '事项材料', deliverables: ['一句话请求', '背景', '预期影响', '权衡', '风险', '需要的决策'], rules: ['先说请求。', '使用简洁 bullet。', '权衡要可见。'] },
  { title: '融资材料检查', description: '检查融资叙事中的市场、问题、方案、牵引力和财务逻辑。', category: '创业', tags: ['融资', 'Pitch Deck', '创业'], role: '创业融资顾问', inputLabel: '融资材料或公司介绍', deliverables: ['叙事主线', '薄弱页面', '投资人问题', '数据缺口', '修改优先级'], rules: ['不要夸大牵引力。', '指出投资人会追问处。', '建议要具体到页面。'] },
  { title: '商业模式画布', description: '整理客户、价值主张、渠道、收入、成本和关键假设。', category: '商业', tags: ['商业模式', '创业', '战略'], role: '商业模式分析师', inputLabel: '业务想法和现状', deliverables: ['客户细分', '价值主张', '渠道', '收入模式', '成本结构', '关键假设'], rules: ['假设要可测试。', '避免空泛市场描述。', '标出最大不确定性。'] },
  { title: '增长实验 Backlog', description: '生成增长实验清单，并按影响、信心和成本排序。', category: '增长', tags: ['增长', '实验', '优先级'], role: '增长负责人', inputLabel: '增长目标和现有漏斗', deliverables: ['实验列表', 'ICE 评分', '所需资源', '埋点需求', '两周执行计划'], rules: ['每个实验要有假设。', '定义成功标准。', '不要只列渠道动作。'] },
  { title: '社群运营计划', description: '规划社群定位、内容节奏、互动机制和健康指标。', category: '社区', tags: ['社群', '运营', '增长'], role: '社群运营策略师', inputLabel: '社群目标和成员画像', deliverables: ['定位', '内容栏目', '互动机制', '管理规则', '健康指标'], rules: ['机制要可持续。', '避免过度打扰。', '明确管理员动作。'] },
  { title: 'OKR 草案生成器', description: '把目标拆成 Objective、Key Results、行动和风险。', category: '管理', tags: ['OKR', '目标管理', '团队'], role: '组织管理顾问', inputLabel: '团队目标和约束', deliverables: ['Objective', 'Key Results', '关键行动', '风险', '周检查节奏'], rules: ['KR 必须可衡量。', '避免任务型 KR。', '目标数量要克制。'] },
  { title: '周报自动整理', description: '把零散工作记录整理成进展、问题、风险和下周计划。', category: '办公', tags: ['周报', '总结', '职场'], role: '职场写作助手', inputLabel: '本周工作记录', deliverables: ['本周完成', '关键进展', '问题与风险', '下周计划', '需要支持'], rules: ['突出结果。', '避免流水账。', '需要支持要具体。'] },
  { title: '学习笔记升维', description: '把原始笔记整理成概念、例子、问题、连接和行动。', category: '学习', tags: ['学习', '笔记', '知识管理'], role: '知识管理教练', inputLabel: '原始学习笔记', deliverables: ['核心概念', '例子', '疑问', '知识连接', '可执行动作'], rules: ['保留原始重点。', '不要替用户编造经历。', '输出适合复习。'] },
  { title: '论文答辩问答', description: '根据论文内容生成答辩可能问题、回答要点和风险提醒。', category: '学术', tags: ['论文', '答辩', '问答'], role: '论文答辩教练', inputLabel: '论文摘要、方法和结论', deliverables: ['高频问题', '回答要点', '方法质疑', '创新点表达', '风险提醒'], rules: ['不编造实验结果。', '回答要简洁可信。', '指出薄弱环节。'] },
  { title: '简历经历打磨', description: '把工作经历改写成行动、结果、指标和能力证据。', category: '职业', tags: ['简历', '求职', '经历'], role: '职业发展顾问', inputLabel: '原始经历描述', deliverables: ['STAR 拆解', '量化建议', '改写版本', '能力标签', '面试追问'], rules: ['不捏造事实。', '缺指标时给替代表达。', '突出个人贡献。'] },
  { title: '面试自我介绍', description: '生成适合岗位的 30 秒、1 分钟和 3 分钟自我介绍。', category: '职业', tags: ['面试', '自我介绍', '求职'], role: '面试表达教练', inputLabel: '个人背景和目标岗位', deliverables: ['30 秒版本', '1 分钟版本', '3 分钟版本', '亮点证据', '可追问点'], rules: ['保持真实。', '围绕岗位匹配。', '不要堆砌形容词。'] },
  { title: '采购对比表', description: '比较供应商方案的价格、能力、风险、服务和决策建议。', category: '运营', tags: ['采购', '供应商', '决策'], role: '采购决策顾问', inputLabel: '供应商资料和需求', deliverables: ['对比表', '成本分析', '风险点', '谈判问题', '推荐方案'], rules: ['不只看价格。', '标出隐性成本。', '建议要说明权衡。'] },
  { title: '自动化流程设计', description: '识别重复工作并设计触发器、动作、工具和异常处理。', category: '自动化', tags: ['自动化', '工作流', '效率'], role: '自动化流程架构师', inputLabel: '当前手工流程', deliverables: ['自动化机会', '触发器', '动作流程', '工具建议', '异常处理', '测试清单'], rules: ['先保留人工审核点。', '避免过度自动化。', '说明失败回退。'] },
  { title: '知识库文章生成', description: '把问题解决过程整理成知识库文章和排查步骤。', category: '知识库', tags: ['知识库', '文档', '客服'], role: '技术文档编辑', inputLabel: '问题和解决过程', deliverables: ['标题', '适用范围', '原因', '解决步骤', '常见错误', '升级路径'], rules: ['步骤要可复制。', '说明前置条件。', '避免内部黑话。'] },
  { title: 'API 错误排查', description: '根据接口报错整理可能原因、验证步骤和修复方案。', category: '研发', tags: ['API', '调试', '后端'], role: '后端排障工程师', inputLabel: '错误信息、请求和日志', deliverables: ['错误摘要', '可能原因', '验证步骤', '修复建议', '预防措施'], rules: ['先验证最可能原因。', '不要泄露敏感信息。', '区分客户端和服务端问题。'] },
  { title: '模型提示词优化器', description: '评估并重写提示词的角色、目标、输入、约束和输出格式。', category: '提示词工程', tags: ['提示词', '优化', 'AI'], role: '提示词工程专家', inputLabel: '原始提示词和使用目标', deliverables: ['问题诊断', '优化原则', '重写版本', '变量说明', '测试用例'], rules: ['保留用户真实意图。', '不要加入无关约束。', '输出可直接复制。'] },
]

export const chineseFeaturedPrompts: PublicPrompt[] = chinesePromptSpecs.map((spec, index) => ({
  id: 910001 + index,
  title: spec.title,
  description: spec.description,
  content: `# 角色\n你是${spec.role}。\n\n# 输入\n${spec.inputLabel}：\n{{input}}\n\n# 任务\n请输出以下内容：\n${spec.deliverables.map((item, itemIndex) => `${itemIndex + 1}. ${item}`).join('\n')}\n\n# 规则\n${spec.rules.map(rule => `- ${rule}`).join('\n')}\n\n# 输出要求\n结构清晰，优先使用小标题和表格；如果信息不足，请先列出需要补充的问题。`,
  author: 'Note Prompt',
  author_id: 0,
  category: spec.category,
  tags: spec.tags,
  views_count: 80 + index * 5,
  favorites_count: 0,
  is_featured: true,
  created_at: publishedAt,
  updated_at: publishedAt,
}))
