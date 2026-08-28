import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, Eye, Moon, ScanFace, Sparkles, X } from 'lucide-react'
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { DOMAINS, getWellnessPlan, type Domain } from './exercises'
import { createFrostBridge, type FrostBridgeEvent, type FrostBridgePayload } from './frostBridge'
import { cameraPreference, consumeCameraAutoStart, rememberCamera } from './cameraPreference'
import VideoAnalysisPanel from './VideoAnalysisPanel'

type Point={x:number;y:number;visibility?:number}
type Complexion={label:string;reliable:boolean;tips:string[]}
const CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]]
const BASE=import.meta.env.BASE_URL.replace(/\/$/,'')
const MODEL=`${BASE}/models/pose_landmarker_lite.task`
const FACE_MODEL=`${BASE}/models/face_landmarker.task`
const WASM=`${BASE}/wasm`
const CLASSIFIER_API=`${BASE}/api/yoga`
const CLASSIFIER_TARGETS:Record<string,string>={warrior2:'yoga_warrior_two',tree:'yoga_tree_supported',low_lunge:'yoga_low_lunge_supported',cat_cow:'yoga_cat_cow',child:'yoga_child_pose_supported',bridge:'yoga_bridge'}
const DOMAIN_ORDER:Domain[]=['yoga','pilates','postpartum']
const PHONE_LOCAL = window.location.protocol === 'capacitor:'
function cameraErrorMessage(error:unknown){
  const name=error instanceof DOMException?error.name:''
  if(name==='NotAllowedError'||name==='SecurityError')return PHONE_LOCAL?'摄像头权限未开启。请在 iPhone 设置 → Pocket Buddy 中允许相机，然后重试。':'摄像头权限未开启。请在浏览器网站设置中允许摄像头，然后重试。'
  if(name==='NotFoundError'||name==='DevicesNotFoundError')return'没有检测到可用摄像头，请确认设备摄像头可用后重试。'
  if(name==='NotReadableError'||name==='TrackStartError'||name==='AbortError')return'摄像头可能被相机或视频通话占用，请关闭其他应用后重试。'
  return error instanceof Error?error.message:'摄像头启动失败，请刷新页面后重试。'
}
async function requestCamera(){
  if(!window.isSecureContext)throw new Error('摄像头需要 HTTPS 安全连接。')
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前浏览器无法调用摄像头，请使用系统 Safari 或 Chrome 打开。')
  try{return await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720}},audio:false})}
  catch(error){if(!(error instanceof DOMException)||!['OverconstrainedError','TypeError'].includes(error.name))throw error;return navigator.mediaDevices.getUserMedia({video:true,audio:false})}
}

function Logo(){return <svg viewBox="0 0 256 256" className="h-14 w-14 md:h-16 md:w-16" fill="currentColor" aria-hidden="true"><path d="M128 18a110 110 0 0 0-110 110h55a55 55 0 0 1 55-55V18Z"/><path d="M238 128A110 110 0 0 0 128 18v55a55 55 0 0 1 55 55h55Z"/><path d="M128 238a110 110 0 0 0 110-110h-55a55 55 0 0 1-55 55v55Z"/><path d="M18 128a110 110 0 0 0 110 110v-55a55 55 0 0 1-55-55H18Z"/></svg>}
function dist(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y)}
function complexionFromFrame(video:HTMLVideoElement,p:Point[]):Complexion{
  const frame=document.createElement('canvas'),width=192,height=Math.max(108,Math.round(192*video.videoHeight/video.videoWidth));frame.width=width;frame.height=height
  const ctx=frame.getContext('2d',{willReadFrequently:true});if(!ctx)return{label:'暂不可用',reliable:false,tips:['本次画面处理未完成，请稍后重新检测。']}
  ctx.drawImage(video,0,0,width,height)
  const samples:number[][]=[]
  ;[205,425].forEach(index=>{const cx=Math.round(p[index].x*width),cy=Math.round(p[index].y*height),radius=Math.max(4,Math.round(width*.025));const data=ctx.getImageData(Math.max(0,cx-radius),Math.max(0,cy-radius),Math.min(radius*2,width-Math.max(0,cx-radius)),Math.min(radius*2,height-Math.max(0,cy-radius))).data;for(let i=0;i<data.length;i+=16){const r=data[i],g=data[i+1],b=data[i+2],light=.2126*r+.7152*g+.0722*b;if(light>24&&light<242)samples.push([r,g,b,light])}})
  if(samples.length<10)return{label:'画面不稳定',reliable:false,tips:['请保持正脸并使用均匀自然光。','稳定几秒后再重新进行检测。']}
  const mean=(at:number)=>samples.reduce((sum,v)=>sum+v[at],0)/samples.length,r=mean(0),g=mean(1),b=mean(2),light=mean(3)
  if(light<55)return{label:'光线不足',reliable:false,tips:['移到面部受光均匀的位置，避免背光。','调整光线后重新检测，当前结果不用于气色参考。']}
  if(light>222)return{label:'光线过强',reliable:false,tips:['避开窗边或灯光直射，防止面部过曝。','降低光线后重新检测，当前结果不用于气色参考。']}
  const warmth=(r-g)/Math.max(light,1),coolness=(b-g)/Math.max(light,1),yellow=((r+g)/2-b)/Math.max(light,1)
  if(light<86)return{label:'气色偏暗',reliable:true,tips:['优先安排短暂休息、补水，并到自然光环境活动几分钟。','今天避免连续久坐，每小时安排一次轻缓起身活动。']}
  if(warmth>.205)return{label:'气色偏红',reliable:true,tips:['先到温度舒适、通风的位置休息几分钟并适量补水。','避免立即进行高强度活动，待状态平稳后可在相同光线下复测。']}
  if(coolness>.04)return{label:'气色偏冷',reliable:true,tips:['注意环境温度，适当保暖并进行几分钟轻缓活动。','安排一杯温水和规律进餐，避免长时间空腹。']}
  if(warmth<.068)return{label:'气色偏淡',reliable:true,tips:['今天优先保证规律饮食、补水与充足休息。','若本人持续感到明显乏力、头晕或不适，请咨询专业人员。']}
  if(yellow>.235)return{label:'气色偏黄暖',reliable:true,tips:['先确认室内暖光和妆容是否影响画面，再到自然光下复测。','生活建议以规律作息、清淡均衡饮食和适量补水为主。']}
  if(warmth>.135&&light>112)return{label:'自然红润',reliable:true,tips:['当前画面气色观感较有活力，继续保持规律作息。','维持均衡饮食、适量补水和每日轻缓活动。']}
  return{label:'均匀自然',reliable:true,tips:['当前画面气色观感较均匀，继续保持稳定作息。','保持规律饮食、适量补水和日常轻缓活动。']}
}
function tongueFromFrame(video:HTMLVideoElement,p:Point[]):Complexion{
  const frame=document.createElement('canvas'),width=256,height=Math.max(144,Math.round(256*video.videoHeight/video.videoWidth));frame.width=width;frame.height=height
  const ctx=frame.getContext('2d',{willReadFrequently:true});if(!ctx)return{label:'暂不可用',reliable:false,tips:['本次画面处理未完成，请稍后重试。']}
  ctx.drawImage(video,0,0,width,height)
  const mouthWidth=Math.max(12,dist(p[61],p[291])*width),cx=((p[61].x+p[291].x)/2)*width,top=p[13].y*height,left=Math.max(0,Math.round(cx-mouthWidth*.48)),y=Math.max(0,Math.round(top-mouthWidth*.05)),w=Math.min(width-left,Math.round(mouthWidth*.96)),h=Math.min(height-y,Math.round(mouthWidth*1.05))
  if(w<12||h<12)return{label:'未识别舌面',reliable:false,tips:['请正对镜头自然伸舌，让舌面完整入镜。']}
  const data=ctx.getImageData(left,y,w,h).data,pixels:number[][]=[]
  for(let i=0;i<data.length;i+=12){const r=data[i],g=data[i+1],b=data[i+2],light=.2126*r+.7152*g+.0722*b;if(light>35&&r>g*1.025&&r>b*1.025)pixels.push([r,g,b,light])}
  if(pixels.length<Math.max(40,w*h*.035))return{label:'未识别舌面',reliable:false,tips:['自然伸舌并保持 3–5 秒，避免舌面被嘴唇遮挡。','使用均匀白光，避免暖色灯和滤镜。']}
  const mean=(at:number)=>pixels.reduce((sum,v)=>sum+v[at],0)/pixels.length,r=mean(0),g=mean(1),b=mean(2),light=mean(3),yellow=(r+g)/2-b,red=r-g
  if(light<72)return{label:'舌面画面偏暗',reliable:false,tips:['当前舌面光线不足，请增加正面均匀白光。','调整光线后重新检测，本次不用于舌苔参考。']}
  if(light>210)return{label:'舌面画面过曝',reliable:false,tips:['请避开直射光，降低曝光后重新检测。','过曝会把舌苔误判为偏白。']}
  if(yellow>48&&g>92)return{label:'偏黄苔观感',reliable:true,tips:['先排除咖啡、茶、食物染色和暖光影响，再于自然光下复测。','保持饮水和常规口腔清洁；若黄苔持续并伴随口腔不适，请咨询医生或牙医。']}
  if(light>145&&Math.max(r,g,b)-Math.min(r,g,b)<48)return{label:'偏厚白苔观感',reliable:true,tips:['保持饮水和温和的日常口腔清洁，不要用力刮舌。','若白色覆盖持续、疼痛、灼热或擦除后出血，请咨询医生或牙医。']}
  if(red>62&&r>155)return{label:'舌面偏红观感',reliable:true,tips:['先避免辛辣、过烫食物并适量补水，稍后在相同光线下复测。','若偏红持续并伴有疼痛、溃疡或发热，请咨询专业人员。']}
  if(red<30&&light>105)return{label:'舌面偏淡观感',reliable:true,tips:['今天优先保证规律饮食、补水和充分休息。','若同时持续出现明显乏力、头晕或其他不适，请咨询专业人员。']}
  if(b>g*.92&&light<125)return{label:'舌面偏暗紫观感',reliable:true,tips:['先在自然白光下复测，排除滤镜、低照度和食物染色。','若颜色变化持续或伴随呼吸、胸部等不适，应及时寻求专业评估。']}
  return{label:'薄白苔观感',reliable:true,tips:['当前画面舌苔观感较薄且均匀，维持饮水和常规口腔清洁。','保持规律作息和均衡饮食，无需频繁或用力刮舌。']}
}
function coach(id:string,p:Point[]){const needed=[11,12,23,24,25,26,27,28];if(needed.some(i=>(p[i]?.visibility??0)<.55))return{title:'等待完整入镜',cue:'请后退一点，让肩、髋、膝和脚踝清晰可见。',tone:'wait'};const hip=Math.max(dist(p[23],p[24]),.03);if(id==='tree'&&Math.abs(p[23].y-p[24].y)/hip>.28)return{title:'降低难度',cue:'降低抬腿高度，让骨盆接近水平；需要时扶墙。',tone:'adjust'};if(id==='mountain'&&Math.abs(p[11].y-p[12].y)/hip>.32)return{title:'放松肩膀',cue:'让较高一侧肩膀缓慢下沉，保持自然呼吸。',tone:'adjust'};if(id==='legraise'&&Math.abs(p[23].y-p[24].y)/hip>.3)return{title:'稳定骨盆',cue:'减小抬腿幅度，保持两侧骨盆接近水平。',tone:'adjust'};return{title:'可见姿态稳定',cue:'保持当前幅度，不憋气；出现疼痛或不适立即停止。',tone:'good'}}

export default function App(){
  const[bridge]=useState(createFrostBridge)
  const[videoMode,setVideoMode]=useState(false)
  const[autoCamera,setAutoCamera]=useState(()=>cameraPreference().enabled)
  const autoCameraRef=useRef(autoCamera),autoStartedRef=useRef(false),startAttemptRef=useRef(0)
  autoCameraRef.current=autoCamera
  const[workspace,setWorkspace]=useState(bridge?.embedded??false),[cyber,setCyber]=useState(false),[careMode,setCareMode]=useState<'complexion'|'tongue'>('complexion'),[tongueModelOnline,setTongueModelOnline]=useState(false),[domain,setDomain]=useState<Domain>('yoga'),[selected,setSelected]=useState('warrior2'),[running,setRunning]=useState(false),[starting,setStarting]=useState(false)
  const[status,setStatus]=useState({title:'等待开始',cue:'选择动作后即可开启摄像头。',tone:'wait'}),[modelNote,setModelNote]=useState('本机关键点模型待启动'),[error,setError]=useState('')
  const videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null),landmarkerRef=useRef<PoseLandmarker|null>(null),streamRef=useRef<MediaStream|null>(null),rafRef=useRef(0),lastRef=useRef(-1),selectedRef=useRef(selected),busyRef=useRef(false),lastClassifyRef=useRef(0),confirmedRef=useRef(false)
  const domainRef=useRef<Domain>(domain),workoutStartedRef=useRef(0),workoutActiveRef=useRef(false),lastConfidenceRef=useRef<number|undefined>(undefined),reportedPoseRef=useRef(false)
  const[recorded,setRecorded]=useState(false)
  const[faceRunning,setFaceRunning]=useState(false),[faceStarting,setFaceStarting]=useState(false),[faceRemaining,setFaceRemaining]=useState(30),[faceStatus,setFaceStatus]=useState('等待开始检测'),[faceError,setFaceError]=useState(''),[reading,setReading]=useState({title:'今日建议尚未生成',tag:'WELLNESS CARE',complexion:'待检测',reliable:false,advice:['保持自然表情，面向摄像头','约 30 秒后生成气色观感与生活建议']})
  const faceVideoRef=useRef<HTMLVideoElement>(null),faceCanvasRef=useRef<HTMLCanvasElement>(null),faceLandmarkerRef=useRef<FaceLandmarker|null>(null),faceStreamRef=useRef<MediaStream|null>(null),faceRafRef=useRef(0),faceLastRef=useRef(-1),lastReadingRef=useRef(0),faceStartedRef=useRef(0),facePointsRef=useRef<Point[]|null>(null),faceSamplesRef=useRef<{complexion:Complexion;eyeOpen:number;eyeTilt:number}[]>([])
  const current=DOMAINS[domain].exercises.find(x=>x.id===selected)??DOMAINS[domain].exercises[0]
  const wellnessPlan=getWellnessPlan(reading.complexion)
  function reportToFrost(type:FrostBridgeEvent,payload:FrostBridgePayload={}){bridge?.send(type,payload)}
  useEffect(()=>{reportToFrost('opened')},[])
  useEffect(()=>{
    // Defer past StrictMode's setup/cleanup replay so it cannot cancel the only camera request.
    const timer=window.setTimeout(()=>{
      if(autoStartedRef.current||document.visibilityState==='hidden'||!consumeCameraAutoStart(bridge))return
      autoStartedRef.current=true;void start()
    },0)
    return()=>window.clearTimeout(timer)
  },[])
  useEffect(()=>{
    if(!running||starting||status.title==='等待开始')return
    const speak=()=>bridge?.speak(`${status.title}。${status.cue}`)
    const timer=window.setTimeout(speak,1200),retry=window.setInterval(speak,6000)
    return()=>{window.clearTimeout(timer);window.clearInterval(retry)}
  },[running,starting,status.title,status.cue])
  useEffect(()=>{
    const hidden=()=>{if(document.visibilityState==='hidden')stop(false)}
    document.addEventListener('visibilitychange',hidden)
    return()=>document.removeEventListener('visibilitychange',hidden)
  },[])
  useEffect(()=>()=>{++startAttemptRef.current;bridge?.stopSpeech();if(workoutActiveRef.current){const activeDomain=domainRef.current,exercise=DOMAINS[activeDomain].exercises.find(item=>item.id===selectedRef.current);reportToFrost('cancelled',{domain:activeDomain,exerciseId:selectedRef.current,exerciseName:exercise?.name,durationSec:Math.max(0,Math.round((Date.now()-workoutStartedRef.current)/1000)),stopReason:'page_closed'})}cancelAnimationFrame(rafRef.current);cancelAnimationFrame(faceRafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());faceStreamRef.current?.getTracks().forEach(t=>t.stop());landmarkerRef.current?.close();faceLandmarkerRef.current?.close()},[])
  useEffect(()=>{if(!cyber||careMode!=='tongue')return;fetch('http://127.0.0.1:8766/health').then(r=>r.ok?r.json():Promise.reject()).then(x=>setTongueModelOnline(x?.model_loaded===true)).catch(()=>setTongueModelOnline(false))},[cyber,careMode])
  function stop(notifyBridge=true,stopReason='user_stop'){
    ++startAttemptRef.current;setStarting(false);bridge?.stopSpeech()
    if(notifyBridge&&workoutActiveRef.current){const activeDomain=domainRef.current,exercise=DOMAINS[activeDomain].exercises.find(item=>item.id===selectedRef.current);reportToFrost('cancelled',{domain:activeDomain,exerciseId:selectedRef.current,exerciseName:exercise?.name,durationSec:Math.max(0,Math.round((Date.now()-workoutStartedRef.current)/1000)),stopReason})}
    workoutActiveRef.current=false
    cancelAnimationFrame(rafRef.current)
    rafRef.current=0
    streamRef.current?.getTracks().forEach(t=>t.stop())
    streamRef.current=null
    lastRef.current=-1
    confirmedRef.current=false
    reportedPoseRef.current=false
    lastConfidenceRef.current=undefined
    workoutStartedRef.current=0
    if(videoRef.current){videoRef.current.pause();videoRef.current.srcObject=null}
    const canvas=canvasRef.current
    if(canvas){canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);canvas.width=0;canvas.height=0}
    setRunning(false)
    setStatus({title:'等待开始',cue:'选择动作后即可开启摄像头。',tone:'wait'})
    setModelNote('本机关键点模型待启动')
  }
  function stopFace(finalStatus='等待开始检测'){cancelAnimationFrame(faceRafRef.current);faceRafRef.current=0;faceStreamRef.current?.getTracks().forEach(t=>t.stop());faceStreamRef.current=null;faceLastRef.current=-1;if(faceVideoRef.current){faceVideoRef.current.pause();faceVideoRef.current.srcObject=null}const canvas=faceCanvasRef.current;if(canvas){canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);canvas.width=0;canvas.height=0}faceLandmarkerRef.current?.close();faceLandmarkerRef.current=null;setFaceRunning(false);setFaceStatus(finalStatus)}
  function changeCareMode(next:'complexion'|'tongue'){stopFace();setCareMode(next);setFaceRemaining(30);setFaceError('');setReading(next==='tongue'?{title:'舌苔建议尚未生成',tag:'TONGUE CARE',complexion:'待检测',reliable:false,advice:['请正对摄像头，自然伸出舌头','约 30 秒后生成舌苔观感与生活建议']}:{title:'今日建议尚未生成',tag:'WELLNESS CARE',complexion:'待检测',reliable:false,advice:['保持自然表情，面向摄像头','约 30 秒后生成气色观感与生活建议']})}
  function openLinkedMove(nextDomain:'yoga'|'pilates',id:string){stopFace();setCyber(false);setWorkspace(true);setDomain(nextDomain);domainRef.current=nextDomain;setSelected(id);selectedRef.current=id;setError('');setModelNote(CLASSIFIER_TARGETS[id]?'等待动作模型连续帧确认':'动作模型与关键点检测已就绪')}
  function closeWorkspace(){stop();stopFace();setWorkspace(false);setCyber(false)}
  function changeDomain(next:Domain){stop(false);setDomain(next);domainRef.current=next;const first=DOMAINS[next].exercises[0];setSelected(first.id);selectedRef.current=first.id;setModelNote('本机关键点模型待启动');setError('')}
  function select(id:string){stop(false);setSelected(id);selectedRef.current=id;confirmedRef.current=false;reportedPoseRef.current=false;setModelNote(CLASSIFIER_TARGETS[id]?'等待动作模型连续帧确认':'动作模型与关键点检测已就绪')}
  async function classify(video:HTMLVideoElement){if(PHONE_LOCAL){setModelNote("本机关键点已就绪 · 专项体式分类未加载");return}const attempt=startAttemptRef.current;const target=CLASSIFIER_TARGETS[selectedRef.current];if(!target||busyRef.current||performance.now()-lastClassifyRef.current<650)return;busyRef.current=true;lastClassifyRef.current=performance.now();try{const c=document.createElement('canvas');c.width=448;c.height=448;const x=c.getContext('2d');if(!x)return;const side=Math.min(video.videoWidth,video.videoHeight);x.drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,448,448);const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',.82));if(!blob)return;const res=await fetch(`${CLASSIFIER_API}/predict?selected_pose=${target}`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});if(!res.ok)throw new Error();const out=await res.json();if(attempt!==startAttemptRef.current)return;confirmedRef.current=!!out.accepted;lastConfidenceRef.current=typeof out.confidence==='number'?out.confidence:undefined;if(out.accepted&&!reportedPoseRef.current){reportedPoseRef.current=true;const activeDomain=domainRef.current;reportToFrost('pose-confirmed',{domain:activeDomain,exerciseId:selectedRef.current,exerciseName:DOMAINS[activeDomain].exercises.find(item=>item.id===selectedRef.current)?.name,confidence:lastConfidenceRef.current})}setModelNote(out.accepted?`Yoga-82 已确认 · ${(out.confidence*100).toFixed(0)}%`:out.reason==='collecting_frames'?'正在连续帧确认':'动作不确定，指导保持静默')}catch{if(attempt!==startAttemptRef.current)return;confirmedRef.current=false;setModelNote('瑜伽分类服务离线')}finally{busyRef.current=false}}
  async function start(){
    if(running||starting||document.visibilityState==='hidden')return
    const attempt=++startAttemptRef.current
    const current=()=>attempt===startAttemptRef.current&&document.visibilityState!=='hidden'
    setError('');setRecorded(false);setStarting(true)
    try{
      setModelNote('正在请求摄像头权限')
      const stream=await requestCamera()
      if(!current()){stream.getTracks().forEach(track=>track.stop());return}
      rememberCamera(autoCameraRef.current,true)
      streamRef.current=stream
      if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play()}
      if(!current())return
      setRunning(true);workoutStartedRef.current=Date.now();workoutActiveRef.current=true
      const activeDomain=domainRef.current,exercise=DOMAINS[activeDomain].exercises.find(item=>item.id===selectedRef.current)
      reportToFrost('workout-started',{domain:activeDomain,exerciseId:selectedRef.current,exerciseName:exercise?.name})
      setModelNote('摄像头已开启 · 正在加载关键点模型')
      if(!landmarkerRef.current){
        const vision=await FilesetResolver.forVisionTasks(WASM)
        if(!current())return
        let model:PoseLandmarker
        try{model=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minTrackingConfidence:.55})}
        catch(error){if(!current())return;model=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minTrackingConfidence:.55})}
        if(!current()){model.close();return}
        landmarkerRef.current=model
      }
      setModelNote('本机关键点已启动 · 画面仅在本机处理')
      bridge?.speak(`已开始${exercise?.name||'动作陪伴'}。请让全身完整入镜。`)
      console.info('[HerMotion] camera_started permission=granted frames_saved=false')
      loop()
    }catch(error){
      if(!current())return
      if(error instanceof DOMException&&['NotAllowedError','SecurityError'].includes(error.name))rememberCamera(autoCameraRef.current,false)
      stop(false);setError(cameraErrorMessage(error))
    }finally{if(current())setStarting(false)}
  }
  function completeWorkout(){if(starting||!running||!workoutStartedRef.current)return;const activeDomain=domainRef.current,exercise=DOMAINS[activeDomain].exercises.find(item=>item.id===selectedRef.current),durationSec=Math.max(1,Math.round((Date.now()-workoutStartedRef.current)/1000));reportToFrost('completed',{domain:activeDomain,exerciseId:selectedRef.current,exerciseName:exercise?.name,durationSec,poseConfirmed:confirmedRef.current,confidence:lastConfidenceRef.current});workoutActiveRef.current=false;stop(false);setRecorded(true)}
  function loop(){const v=videoRef.current,c=canvasRef.current,l=landmarkerRef.current;if(!v||!c||!l||!streamRef.current)return;if(v.readyState>=2&&v.currentTime!==lastRef.current){lastRef.current=v.currentTime;const out=l.detectForVideo(v,performance.now());c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');ctx?.clearRect(0,0,c.width,c.height);const p=out.landmarks?.[0] as Point[]|undefined;if(p&&ctx){ctx.lineWidth=4;ctx.strokeStyle='#fff';CONNECTIONS.forEach(([a,b])=>{if((p[a].visibility??0)>.45&&(p[b].visibility??0)>.45){ctx.beginPath();ctx.moveTo(p[a].x*c.width,p[a].y*c.height);ctx.lineTo(p[b].x*c.width,p[b].y*c.height);ctx.stroke()}});void classify(v);setStatus(CLASSIFIER_TARGETS[selectedRef.current]&&!confirmedRef.current?{title:'等待动作确认',cue:'保持全身入镜；模型不确定时不会给出纠正。',tone:'wait'}:coach(selectedRef.current,p))}else setStatus({title:'等待入镜',cue:'站到画面中央，让全身完整入镜。',tone:'wait'})}rafRef.current=requestAnimationFrame(loop)}

  async function startFace(){if(faceRunning||faceStarting)return;setFaceError('');setFaceStarting(true);setFaceRemaining(30);faceSamplesRef.current=[];setReading(careMode==='tongue'?{title:'正在观察舌面',tag:'30-SECOND TONGUE OBSERVATION',complexion:'分析中',reliable:false,advice:['请自然伸舌并保持舌面完整入镜','请使用均匀白光，完成后将自动关闭模型']}:{title:'正在观察可见状态',tag:'30-SECOND OBSERVATION',complexion:'分析中',reliable:false,advice:['保持自然表情并正对摄像头','请尽量维持均匀光线，完成后将自动关闭模型']});try{setFaceStatus('正在请求摄像头权限');const stream=await requestCamera();faceStreamRef.current=stream;if(faceVideoRef.current){faceVideoRef.current.srcObject=stream;await faceVideoRef.current.play()}setFaceRunning(true);setFaceStatus('摄像头已开启 · 正在加载模型');if(!faceLandmarkerRef.current){const vision=await FilesetResolver.forVisionTasks(WASM);try{faceLandmarkerRef.current=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:FACE_MODEL,delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minTrackingConfidence:.55})}catch{faceLandmarkerRef.current=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:FACE_MODEL,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minTrackingConfidence:.55})}}faceStartedRef.current=performance.now();lastReadingRef.current=0;setFaceStatus('正在观察 · 30 秒');faceLoop()}catch(error){stopFace();setFaceError(cameraErrorMessage(error))}finally{setFaceStarting(false)}}
  async function predictTongueFrame(video:HTMLVideoElement){try{const p=facePointsRef.current;if(!p)return;const mouthWidth=Math.max(80,dist(p[61],p[291])*video.videoWidth),cx=((p[61].x+p[291].x)/2)*video.videoWidth,top=p[13].y*video.videoHeight,size=Math.min(video.videoWidth,video.videoHeight,Math.round(mouthWidth*1.45)),sx=Math.max(0,Math.min(video.videoWidth-size,Math.round(cx-size/2))),sy=Math.max(0,Math.min(video.videoHeight-size,Math.round(top-mouthWidth*.12)));const shot=document.createElement('canvas');shot.width=384;shot.height=384;shot.getContext('2d')?.drawImage(video,sx,sy,size,size,0,0,384,384);const blob=await new Promise<Blob|null>(resolve=>shot.toBlob(resolve,'image/jpeg',.9));if(!blob)return;const response=await fetch('http://127.0.0.1:8766/predict',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});if(!response.ok)return;const output=await response.json(),findings=Array.isArray(output.findings)?output.findings:[];if(!findings.length)return;const advice=findings.flatMap((item:{advice?:string[]})=>item.advice??[]);setReading({title:'舌象模型建议已生成',tag:'TONGUEEXPERT · REAL TRAINED MODEL',complexion:findings.map((item:{label:string})=>item.label).slice(0,2).join(' · '),reliable:true,advice:[...advice.slice(0,3),'模型结果只描述可见舌象特征，不用于疾病或体质诊断。']})}catch{setTongueModelOnline(false)}}
  function faceLoop(){
    const v=faceVideoRef.current,c=faceCanvasRef.current,l=faceLandmarkerRef.current
    if(!v||!c||!l||!faceStreamRef.current)return
    const now=performance.now(),elapsed=now-faceStartedRef.current,remaining=Math.max(0,30-Math.floor(elapsed/1000))
    setFaceRemaining(remaining)
    if(v.readyState>=2&&v.currentTime!==faceLastRef.current){
      faceLastRef.current=v.currentTime
      const out=l.detectForVideo(v,now);c.width=v.videoWidth;c.height=v.videoHeight
      const ctx=c.getContext('2d');ctx?.clearRect(0,0,c.width,c.height)
      const p=out.faceLandmarks?.[0] as Point[]|undefined
      if(p&&ctx){
        facePointsRef.current=p
        setFaceStatus(`正在观察 · ${remaining} 秒`)
        const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],left=[33,160,158,133,153,144,33],right=[362,385,387,263,373,380,362]
        ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2;[oval,left,right].forEach(line=>{ctx.beginPath();line.forEach((idx,i)=>{const x=p[idx].x*c.width,y=p[idx].y*c.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()})
        const eyeWidth=Math.max(dist(p[33],p[133]),.001),eyeOpen=(dist(p[159],p[145])+dist(p[386],p[374]))/(2*eyeWidth),eyeTilt=Math.abs(p[33].y-p[263].y)/Math.max(dist(p[33],p[263]),.001)
        if(now-lastReadingRef.current>900){lastReadingRef.current=now;faceSamplesRef.current.push({complexion:careMode==='tongue'?tongueFromFrame(v,p):complexionFromFrame(v,p),eyeOpen,eyeTilt})}
      }else setFaceStatus(`请将面部移到中央 · ${remaining} 秒`)
    }
    if(elapsed>=30000){
      const samples=faceSamplesRef.current,reliable=samples.filter(s=>s.complexion.reliable),pool=reliable.length?reliable:samples
      if(!pool.length){setReading({title:'本次未获得有效画面',tag:'PLEASE RETRY',complexion:'无法判断',reliable:false,advice:[careMode==='tongue'?'请在均匀白光下让舌面完整入镜':'请在均匀光线下保持面部完整入镜','调整后可重新进行 30 秒观察']})}
      else{const counts=new Map<string,number>();pool.forEach(s=>counts.set(s.complexion.label,(counts.get(s.complexion.label)??0)+1));const label=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0],chosen=pool.find(s=>s.complexion.label===label)!,avgEye=pool.reduce((n,s)=>n+s.eyeOpen,0)/pool.length,avgTilt=pool.reduce((n,s)=>n+s.eyeTilt,0)/pool.length,late=new Date().getHours()>=23||new Date().getHours()<6;setReading(careMode==='tongue'?{title:'舌苔观感与建议已生成',tag:tongueModelOnline?'TMC MODEL + 30 秒观察':'本地规则 · 30 秒观察',complexion:chosen.complexion.label,reliable:chosen.complexion.reliable,advice:[...chosen.complexion.tips,late?'现在时间较晚：尽量减少夜间进食并为睡眠留出完整时间':'保持规律作息与均衡饮食','舌象会受饮食、清洁、光线和拍摄设备影响，建议在相同条件下复测']}:{title:'气色观感与建议已生成',tag:avgEye<.18?'建议暂停用眼':'30 秒观察完成',complexion:chosen.complexion.label,reliable:chosen.complexion.reliable,advice:[...chosen.complexion.tips,late?'现在时间较晚：尽量提前放下屏幕，为睡眠留出完整时间':'保持规律作息，今晚尽量在固定时间休息',avgEye<.18?'暂停近距离用眼，远眺至少 20 秒，让眼睛短暂休息':'每使用屏幕 20 分钟，远眺至少 20 秒',avgTilt>.045?'调整坐姿、放松肩颈，再做两轮轻缓的肩部下沉':'喝一杯水，并起身轻缓活动 3–5 分钟']})}
      if(careMode==='tongue'&&tongueModelOnline)void predictTongueFrame(v)
      setFaceRemaining(0);stopFace('建议已生成 · 模型已自动关闭');return
    }
    faceRafRef.current=requestAnimationFrame(faceLoop)
  }

  return <div data-embedded={bridge?.embedded||undefined} className="herMotionApp h-screen min-h-[600px] w-full bg-black p-3 font-inter md:p-4"><div className="herMotionShell relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-black">
    {!bridge?.embedded&&<video src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260717_120352_eb988725-1351-43b3-8095-16e4a1005e3d.mp4" autoPlay loop muted playsInline className="heroVideo anim-fade absolute inset-0 h-full w-full object-cover"/>}<div className="heroShade pointer-events-none absolute inset-0 bg-black/20"/><div className="heroGradient pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35"/>
    <nav className="herMotionNav relative z-20 flex items-center justify-between px-6 pt-6 md:px-10 md:pt-8"><div className="anim-stagger flex flex-col items-center"><Logo/><span className="mt-1 text-[10px] font-light tracking-[.4em] text-white md:text-xs">H E R M O T I O N</span></div><div className="flex items-center gap-3">{bridge?.embedded?<span className="border-2 border-black bg-white px-3 py-2 text-xs text-black">FROST SESSION</span>:<>{(workspace||cyber)&&<button className="btn-cut-border px-5 py-2.5 text-sm text-white" onClick={closeWorkspace}><span className="flex items-center gap-2"><ChevronLeft className="h-4 w-4"/>返回首页</span></button>}<button className="btn-cut hidden bg-white px-5 py-2.5 text-sm text-black md:block" onClick={()=>{stop();setWorkspace(false);setCyber(true)}}>{cyber?'WELLNESS CARE':'状态关怀'}</button></>}</div></nav>

    {!workspace&&!cyber?<main className="homeHero relative z-10 flex flex-1 flex-col justify-between px-6 pb-8 md:px-10 md:pb-10"><div className="relative flex flex-1 items-center"><div className="anim-stagger absolute left-0 top-[18%] hidden flex-col gap-6 lg:flex"><p className="max-w-[220px] text-base leading-relaxed text-white/80">Three ways to move<br/>one quiet<br/>companion</p><div className="mt-4 flex items-center gap-2"><span className="h-4 w-4 rounded-full border border-white/40"/><span className="h-4 w-4 rounded-full border border-white/40"/><span className="ml-2 text-xs text-white/60">LOCAL VISION · 01</span></div></div><div className="anim-stagger w-full text-center"><h1 className="text-3xl font-normal leading-[1.1] tracking-[-.04em] text-white sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl" style={{textShadow:'0 2px 12px rgba(0,0,0,.25)'}}>恢复不是竞赛<br/>每一步<br/>都被看见</h1></div></div><div className="mt-8 grid grid-cols-1 items-center gap-6 md:grid-cols-3"><p className="max-w-[280px] text-center text-sm leading-relaxed text-white md:ml-auto md:text-left">产后恢复、普拉提与瑜伽。39 个动作，一套安静、克制的视觉陪伴。</p><div className="flex flex-col items-center gap-4 md:gap-5"><span className="text-2xl font-medium text-white md:text-3xl">Her Motion</span><button className="btn-cut group flex w-full max-w-[280px] items-center justify-center gap-2 bg-white py-3.5 text-black" onClick={()=>setWorkspace(true)}><span className="text-sm font-medium">进入动作陪伴</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1"/></button><button className="btn-cut-border w-full max-w-[280px] px-5 py-3 text-sm text-white" onClick={()=>setCyber(true)}><span className="flex items-center justify-center gap-2"><ScanFace className="h-4 w-4"/>开启状态关怀</span></button></div><div className="flex justify-center md:justify-end"><div className="btn-cut-border px-5 py-3 text-xs text-white"><span>NON-COMMERCIAL DEMO</span></div></div></div></main>:
    cyber?<main className="cyberWorkspace relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5 md:px-10"><div className="workspaceHead"><div><span>HER MOTION / WELLNESS CARE</span><h1>日常健康关怀</h1><p>{careMode==='tongue'?'通过约 30 秒舌面观察生成舌质、舌苔观感和一般生活建议。':'通过约 30 秒规则化画面分析生成气色观感，以及作息、补水、远眺和肩颈放松建议。'}</p></div><div className="cyberSeal"><Sparkles className="h-4 w-4"/> {careMode==='tongue'?(tongueModelOnline?'TMC MODEL ONLINE':'TONGUE RULE FALLBACK'):'FACE LANDMARK + RULES'}</div></div><div className="careTabs"><button className={careMode==='complexion'?'active':''} onClick={()=>changeCareMode('complexion')}>面部气色</button><button className={careMode==='tongue'?'active':''} onClick={()=>changeCareMode('tongue')}>舌苔观感</button></div><section className="cyberGrid"><div className="liquidGlass cyberCamera"><video ref={faceVideoRef} muted playsInline/><canvas ref={faceCanvasRef}/>{!faceRunning&&<div className="cyberEmpty"><ScanFace/><small>{careMode==='tongue'?'TONGUE CARE / READY':'WELLNESS CARE / READY'}</small><b>{careMode==='tongue'?'请正对镜头自然伸舌':'请正对摄像头'}</b><span>{careMode==='tongue'?'保持舌面完整入镜与均匀白光':'保持自然表情与均匀光线'}</span></div>}<div className="cameraStatus"><span>LOCAL VISION</span><b>{faceStatus}</b></div></div><aside className="liquidGlass cyberReading"><div className="panelLabel"><span>{careMode==='tongue'?'舌苔观感与健康建议':'气色观感与健康建议'}</span><b>{faceRunning?`${faceRemaining}s`:careMode==='tongue'?(tongueModelOnline?'MODEL':'RULE FALLBACK'):'RULE-BASED'}</b></div><div className="careMark"><Sparkles/><span>{careMode==='tongue'?'舌苔观感':'气色观感'}<br/><b>{reading.complexion}</b></span></div><small className="readingTag">{reading.tag}</small><h2>{reading.title}</h2><div className="adviceList">{reading.advice.map((item,i)=><div key={item}><em>0{i+1}</em><p>{item}</p></div>)}</div>{reading.complexion!=='待检测'&&reading.complexion!=='分析中'&&<div className="linkedMoves"><small>关联活动方案</small><p>{wellnessPlan.note}</p><div>{wellnessPlan.yoga.slice(0,2).map(id=>{const move=DOMAINS.yoga.exercises.find(x=>x.id===id);return move&&<button key={`y-${id}`} onClick={()=>openLinkedMove('yoga',id)}><em>YOGA</em><b>{move.name}</b></button>})}{wellnessPlan.pilates.slice(0,2).map(id=>{const move=DOMAINS.pilates.exercises.find(x=>x.id===id);return move&&<button key={`p-${id}`} onClick={()=>openLinkedMove('pilates',id)}><em>PILATES</em><b>{move.name}</b></button>})}</div></div>}{faceError&&<div className="errorBox"><X className="h-4 w-4"/>{faceError}</div>}<button className="btn-cut startBtn" onClick={()=>faceRunning?stopFace('检测已手动结束'):void startFace()}><span>{faceRunning?`停止观察 · ${faceRemaining}s`:careMode==='tongue'?'生成舌苔与健康建议':'生成气色与健康建议'}</span><Eye className="h-4 w-4"/></button><div className="cyberDisclaimer"><Moon className="h-4 w-4"/><span>{careMode==='tongue'?'舌象结果只描述当前相机画面，受饮食、口腔清洁、光线和设备影响，不用于疾病或体质诊断。':'气色结果只描述当前相机画面，受肤色、妆容和光线影响，不代表气血、体质、营养状况或疾病诊断。'}</span></div></aside></section></main>:
    <main className="workspace relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5 md:px-10"><div className="workspaceHead"><div><span>HER MOTION / LIVE COMPANION</span><h1>{DOMAINS[domain].name}</h1><p>{videoMode||bridge?.embedded?"本机姿态关键点陪伴；专项体式分类尚未加载，不作医学诊断。":DOMAINS[domain].desc}</p></div><div className="domainTabs">{DOMAIN_ORDER.map((key,i)=><button key={key} className={domain===key?'active':''} onClick={()=>changeDomain(key)}><small>0{i+1} / {DOMAINS[key].kicker}</small><b>{DOMAINS[key].name}</b></button>)}</div></div><label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={autoCamera} onChange={event=>{setAutoCamera(event.target.checked);rememberCamera(event.target.checked)}}/>下次进入自动开启摄像头（首次需授权）</label>
      <div className="careTabs" aria-label="分析来源"><button className={!videoMode?'active':''} onClick={()=>{stop(false);setVideoMode(false)}}>摄像头实时陪伴</button><button className={videoMode?'active':''} onClick={()=>{stop(false);setVideoMode(true)}}>上传视频分析</button></div>
      <section className="productGrid"><aside className="liquidGlass libraryPanel"><div className="panelLabel"><span>01 · 动作库</span><b>{DOMAINS[domain].exercises.length} MOVES</b></div><div className="movementList">{DOMAINS[domain].exercises.map((ex,i)=><button key={ex.id} className={selected===ex.id?'chosen':''} onClick={()=>select(ex.id)}><em>{String(i+1).padStart(2,'0')}</em><span><b>{ex.name}</b><small>{ex.en}</small></span><i>{ex.featured?'演示推荐':'本机关键点'}</i></button>)}</div><div className="modelEvidence"><small>CURRENT MODEL</small><b>{videoMode||bridge?.embedded?"MediaPipe 本机关键点 · 体式确认以实际结果为准":current.note}</b></div></aside>
        {videoMode?<VideoAnalysisPanel key={`${domain}:${selected}`} exerciseId={selected} exerciseName={current.name}/>:<>
        <div className="liquidGlass cameraPanel"><video ref={videoRef} autoPlay muted playsInline/><canvas ref={canvasRef}/>{!running&&<div className="cameraEmpty"><Logo/><small>{DOMAINS[domain].kicker} / READY</small><b>{current.name}</b><span>{current.en}</span><button className="cameraStart" disabled={starting} onClick={()=>void start()}>{starting?'正在请求摄像头…':'开启摄像头'}</button>{error&&<span className="cameraError">{error}</span>}</div>}<div className="cameraStatus"><span>LIVE VISION</span><b>{modelNote}</b></div></div>
        <aside className="liquidGlass coachPanel"><div className="panelLabel"><span>02 · 安全与陪伴</span><b>{bridge?'FROST LINK':'LOCAL'}</b></div><div className={`subGlass feedback ${status.tone}`}><small>CURRENT OBSERVATION</small><h2>{status.title}</h2><p>{status.cue}</p></div><div className="subGlass boundary"><small>VISUAL BOUNDARY</small><b>模型看不到什么</b><p>疼痛、呼吸质量、盆底收缩、腹直肌间距、伤口恢复及医学禁忌。</p></div>{error&&<div className="errorBox"><X className="h-4 w-4"/>{error}</div>}{recorded&&<div className="subGlass feedback good"><small>FROST HEALTH MEMORY</small><h2>本次动作已写回</h2><p>只记录动作、时长与确认结果，不保存摄像头画面。</p></div>}<button className="btn-cut startBtn" disabled={starting} onClick={running?()=>stop(false):()=>void start()}><span>{running?'暂停陪伴':starting?'正在请求摄像头…':'开启摄像头'}</span><ArrowRight className="h-4 w-4"/></button>{running&&bridge&&<button className="btn-cut-border mt-3 w-full px-5 py-3 text-sm text-white" onClick={completeWorkout}>完成并写回 Frost</button>}</aside></>}</section>
    </main>}
  </div></div>
}
