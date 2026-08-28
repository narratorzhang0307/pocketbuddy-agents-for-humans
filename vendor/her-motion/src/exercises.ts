export type Domain = 'postpartum' | 'pilates' | 'yoga'
export type Exercise = { id: string; name: string; en: string; level: string; featured?: boolean; note: string }
export type WellnessPlan = { activity: string[]; yoga: string[]; pilates: string[]; note: string }

export const DOMAINS: Record<Domain, { name: string; kicker: string; desc: string; exercises: Exercise[] }> = {
  postpartum: { name: '产后恢复', kicker: 'RECOVER', desc: '温和恢复、呼吸与稳定性陪伴。出现疼痛或异常症状时立即停止。', exercises: [
    { id:'breathing',name:'侧卧呼吸准备',en:'Side-lying reset',level:'温和',featured:true,note:'体位识别与呼吸节奏陪伴' },
    { id:'trunk',name:'温和躯干旋转',en:'Gentle trunk rotation',level:'基础',featured:true,note:'躯干旋转时序模型已接入' },
    { id:'pelvis',name:'骨盆前后倾',en:'Pelvic tilt',level:'基础',note:'骨盆运动模型已接入' },
    { id:'heel_slide',name:'仰卧脚跟滑动',en:'Heel slide',level:'温和',note:'下肢时序与骨盆稳定检测' },
    { id:'knee_fallout',name:'单膝外展',en:'Bent-knee fallout',level:'温和',note:'髋部活动与骨盆稳定检测' },
    { id:'march',name:'仰卧交替抬腿',en:'Supine march',level:'进阶',note:'左右交替时序检测' },
    { id:'bridge_recovery',name:'温和桥式',en:'Gentle bridge',level:'进阶',note:'桥式体位与关键点模型已接入' },
    { id:'sit_to_stand',name:'坐姿起立',en:'Sit to stand',level:'基础',note:'康复动作时序模型已训练' },
    { id:'wall_squat',name:'靠墙浅蹲',en:'Supported wall squat',level:'基础',note:'下肢动作质量模型已接入' },
    { id:'side_leg',name:'侧卧抬腿',en:'Side-lying leg lift',level:'基础',note:'直腿抬高动作模型已接入' },
    { id:'cat_cow_recovery',name:'四点跪姿活动',en:'Quadruped mobility',level:'基础',note:'图像分类与骨架检测' },
    { id:'supported_lunge',name:'支撑弓步',en:'Supported lunge',level:'进阶',note:'弓步骨架时序模型已接入' },
  ]},
  pilates: { name:'普拉提',kicker:'CONTROL',desc:'强调缓慢、稳定与控制，结合动作时序模型和实时人体关键点。',exercises:[
    { id:'legraise',name:'站立直腿抬高',en:'Standing leg raise',level:'基础',featured:true,note:'动作质量模型测试准确率 85%' },
    { id:'squat',name:'控制深蹲',en:'Controlled squat',level:'基础',featured:true,note:'深蹲动作质量模型已接入' },
    { id:'pilates_bridge',name:'肩桥',en:'Shoulder bridge',level:'基础',note:'桥式分类与骨架检测' },
    { id:'hundred_prep',name:'百次拍击准备',en:'Hundred prep',level:'基础',note:'上肢节奏与躯干稳定检测' },
    { id:'single_leg_stretch',name:'单腿伸展',en:'Single leg stretch',level:'进阶',note:'交替腿部时序检测' },
    { id:'double_leg_stretch',name:'双腿伸展',en:'Double leg stretch',level:'进阶',note:'全身关键点协同检测' },
    { id:'side_kick',name:'侧卧踢腿',en:'Side kick',level:'基础',note:'髋膝踝运动轨迹检测' },
    { id:'clamshell',name:'蚌式开合',en:'Clamshell',level:'基础',note:'髋部运动与躯干稳定检测' },
    { id:'bird_dog',name:'四点跪姿伸展',en:'Bird dog',level:'进阶',note:'对侧肢体与骨盆稳定检测' },
    { id:'roll_down',name:'站姿卷落',en:'Standing roll down',level:'基础',note:'躯干运动阶段检测' },
    { id:'spine_twist',name:'脊柱扭转',en:'Spine twist',level:'基础',note:'躯干旋转时序模型已接入' },
    { id:'lunge',name:'直线弓步',en:'Inline lunge',level:'进阶',note:'弓步动作骨架模型已接入' },
  ]},
  yoga: { name:'瑜伽',kicker:'ALIGN',desc:'Yoga-82 体式分类与实时关键点共同工作，提供外部关节对齐提示。',exercises:[
    { id:'warrior2',name:'战士二式',en:'Warrior II',level:'基础',featured:true,note:'Yoga-82 类别 F1 91.3%' },
    { id:'tree',name:'支撑树式',en:'Supported tree',level:'基础',featured:true,note:'Yoga-82 类别 F1 91.3%' },
    { id:'mountain',name:'山式',en:'Mountain',level:'基础',note:'全身关键点对齐检测' },
    { id:'warrior1',name:'战士一式',en:'Warrior I',level:'基础',note:'Yoga-82 图像分类模型已训练' },
    { id:'warrior3',name:'战士三式',en:'Warrior III',level:'进阶',note:'Yoga-82 类别 F1 95.1%' },
    { id:'low_lunge',name:'低弓步',en:'Low lunge',level:'基础',note:'Yoga-82 类别 F1 85.3%' },
    { id:'cat_cow',name:'猫牛式',en:'Cat cow',level:'基础',note:'Yoga-82 类别 F1 90.7%' },
    { id:'child',name:'婴儿式',en:'Child pose',level:'放松',note:'Yoga-82 类别 F1 78.8%' },
    { id:'bridge',name:'桥式',en:'Bridge pose',level:'基础',note:'Yoga-82 类别 F1 86.4%' },
    { id:'chair',name:'幻椅式',en:'Chair pose',level:'基础',note:'Yoga-82 类别 F1 82.2%' },
    { id:'down_dog',name:'下犬式',en:'Downward dog',level:'基础',note:'Yoga-82 类别 F1 90.8%' },
    { id:'cobra',name:'眼镜蛇式',en:'Cobra pose',level:'基础',note:'Yoga-82 类别 F1 89.9%' },
    { id:'plank',name:'平板式',en:'Plank pose',level:'进阶',note:'分类与关键点检测' },
    { id:'half_moon',name:'半月式',en:'Half moon',level:'进阶',note:'Yoga-82 类别 F1 96.3%' },
    { id:'boat',name:'船式',en:'Boat pose',level:'进阶',note:'Yoga-82 类别 F1 81.9%' },
  ]},
}

const GENTLE:WellnessPlan={activity:['补充一杯水','每小时起身活动 3–5 分钟','今晚尽量保持固定休息时间'],yoga:['child','mountain'],pilates:['roll_down','spine_twist'],note:'以放松和轻缓活动为主，不用于治疗气色或舌象。'}
const ACTIVE:WellnessPlan={activity:['保持规律补水','安排 10–20 分钟轻缓活动','继续保持稳定作息'],yoga:['warrior2','tree'],pilates:['legraise','squat'],note:'当前仅提供一般活动选择，根据个人状态控制强度。'}

export function getWellnessPlan(label:string):WellnessPlan{
  if(!label||label==='待检测'||label==='分析中'||label==='无法判断')return GENTLE
  if(/自然红润|均匀自然|薄白苔|舌面观感较均匀/.test(label))return ACTIVE
  if(/偏红|红点|黄|厚白|少苔|沟裂|齿痕|光滑/.test(label))return{activity:['先补水并短暂休息','避免立即进行高强度活动','稍后在相同条件下复测'],yoga:['cat_cow','child'],pilates:['roll_down','spine_twist'],note:'动作仅用于放松与一般活动，不代表对舌象特征的治疗。'}
  if(/偏淡|偏暗|偏冷|暗紫|乏力/.test(label))return{activity:['规律进餐并适量补水','先进行 5–10 分钟低强度活动','若本人持续不适则停止并咨询专业人员'],yoga:['mountain','child'],pilates:['roll_down','clamshell'],note:'优先低强度动作；不适、头晕或疼痛时不要开始。'}
  return GENTLE
}
