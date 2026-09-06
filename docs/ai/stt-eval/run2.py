"""任意のマニフェスト・条件・言語指定で回して WER を出す。"""
import json, os, sys, time, jiwer
from openai import OpenAI

HERE=os.path.dirname(__file__); BASE=os.path.join(HERE,"fleurs")
man_file, key, model, lang = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
man=json.load(open(os.path.join(BASE, man_file)))
NORM=jiwer.Compose([jiwer.ToLowerCase(), jiwer.RemovePunctuation(),
                    jiwer.RemoveMultipleSpaces(), jiwer.Strip(),
                    jiwer.ReduceToListOfListOfWords()])
client=OpenAI()
rows=[]; t0=time.time()
for r in man:
    kw={"model":model,"file":open(r[key],"rb")}
    if lang!="auto": kw["language"]=lang
    if model.startswith("whisper"): kw["response_format"]="text"
    try:
        res=client.audio.transcriptions.create(**kw)
        hyp=(res if isinstance(res,str) else getattr(res,"text","")).strip()
    except Exception as e:
        hyp=""; print(f"  {r['id']} 失敗: {type(e).__name__}: {str(e)[:90]}")
    rows.append({"id":r["id"],"ref":r["ref"],"hyp":hyp})
ok=[x for x in rows if x["hyp"]]
w=jiwer.wer([x["ref"] for x in ok],[x["hyp"] for x in ok],
            reference_transform=NORM,hypothesis_transform=NORM) if ok else 1.0
tag=f"{model}/{key}/lang={lang}"
print(f"{tag}: WER {w*100:.1f}%  ({len(ok)}/{len(rows)}, {time.time()-t0:.0f}s)")
json.dump({"tag":tag,"wer":w,"rows":rows},
          open(os.path.join(BASE,f"r_{model}_{key}_{lang}_{man_file[:-5]}.json"),"w"),
          ensure_ascii=False,indent=1)
