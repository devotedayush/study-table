import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { cfaLevel1Syllabus } from '@/lib/cfa-data'
import { formulaFlashcards, flashcardCatalogue } from '@/lib/flashcards-data'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const subjectId = new URL(request.url).searchParams.get('subjectId')
  const subject = cfaLevel1Syllabus.find(item => item.id === subjectId)
  if (!subject) return Response.json({error:'Subject not found.'},{status:404})
  const formulaCards = formulaFlashcards.filter(card => card.subject === subject.title)
  const catalogueCards = flashcardCatalogue.filter(group => group.subjectTitle === subject.title).flatMap(group => group.topics.flatMap(topic => topic.cards.map(card => ({id:card.id,title:card.front,module:topic.topicTitle,prompt:card.front,answer:card.back,memoryHook:card.hint}))))
  const cards = [...catalogueCards, ...formulaCards].filter((card,index,all) => all.findIndex(item => item.answer === card.answer) === index)
  const document = await PDFDocument.create()
  document.setTitle(`${subject.title} — Study Table notes`)
  document.setAuthor('Study Table')
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  let page = document.addPage([595.28,841.89]); let y = 785
  const width = 483
  const clean = (value: string) => value.normalize('NFKD').replace(/[αβγδσμρΣπ]/g,c=>({α:'alpha',β:'beta',γ:'gamma',δ:'delta',σ:'sigma',μ:'mu',ρ:'rho',Σ:'Sum',π:'pi'}[c]??c)).replace(/[−–—]/g,'-').replace(/[×]/g,' x ').replace(/[÷]/g,' / ').replace(/[^\x20-\x7E\n]/g,'')
  function line(value:string,size=10,strong=false) {
    const font=strong?bold:regular
    const words=clean(value).split(/\s+/);let text=''
    const draw=()=>{if(y<65){page=document.addPage([595.28,841.89]);y=785}page.drawText(text,{x:56,y,size,font,color:rgb(.09,.18,.24)});y-=size*1.5}
    for(const word of words){const next=text?text+' '+word:word;if(font.widthOfTextAtSize(next,size)>width && text){draw();text=word}else text=next}
    if(text)draw()
  }
  line('STUDY TABLE / CFA LEVEL I',9,true);y-=20
  line(subject.title,24,true);y-=12
  line('Concise concept and formula notes from the built-in study library. Independent practice material; not official CFA Institute curriculum.',10);y-=24
  for(const card of cards){
    if(y<170){page=document.addPage([595.28,841.89]);y=785}
    line(card.title,14,true);line(card.module,9);y-=5
    line(card.prompt,10,true);line(card.answer,11);y-=4
    if(card.memoryHook)line('Recall: '+card.memoryHook,10)
    y-=22
  }
  if(!cards.length){line('Chapter outline',14,true);for(const topic of subject.topics)line(topic.title,11)}
  const pages=document.getPages()
  pages.forEach((p,index)=>{p.drawLine({start:{x:56,y:45},end:{x:539,y:45},thickness:.5,color:rgb(.82,.84,.84)});p.drawText(`Study Table | ${index+1} / ${pages.length}`,{x:56,y:30,size:8,font:regular,color:rgb(.35,.4,.43)})})
  return new Response(new Uint8Array(await document.save()),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="study-table-${subject.id}-notes.pdf"`,'Cache-Control':'public, max-age=3600'}})
}
