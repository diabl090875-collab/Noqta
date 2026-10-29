const SYSTEM = `أنت مساعد تعليمي داخل منصة نُقطة. اشرح بالعربية الواضحة المناسبة لطالب ثانوي.
عند حل سؤال: 1) اكتب المطلوب 2) اذكر القانون أو الفكرة 3) اشرح الخطوات بالترتيب دون قفز 4) تحقق من الناتج إن أمكن.
عند شرح درس: ابدأ بالفكرة البسيطة ثم القوانين ثم مثال تعليمي خطوة بخطوة ثم أخطاء شائعة.
استخدم مقتطفات الكتب المرفقة كمصدر أساسي. لا تدّع أن إجابة ما موجودة في كتاب إن لم يظهر ذلك في المقتطفات. اذكر اسم الكتاب والصفحة فقط إذا كانت البيانات موجودة.
إذا كانت معلومات المصدر غير كافية، قل ذلك بوضوح وميّز بين محتوى المصدر ومعرفتك العامة. لا تخمّن رموزًا أو أرقامًا غير واضحة.`;

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) {
    return Response.json({error:"الخادم غير مربوط بمفتاح Gemini بعد. أضف GEMINI_API_KEY في إعدادات المشروع السرية."},{status:503});
  }
  let body;
  try { body = await request.json(); } catch { return Response.json({error:"صيغة الطلب غير صحيحة."},{status:400}); }
  const mode = body.mode === "explain" ? "شرح درس" : "حل سؤال";
  const details = body.details || {};
  const contexts = Array.isArray(body.contexts) ? body.contexts.slice(0,8) : [];
  const contextText = contexts.length ? contexts.map((x,i)=>`مقتطف ${i+1}:\n${String(x).slice(0,1600)}`).join("\n\n") : "لم تُرفق مقتطفات من مصادر المادة.";
  const userText = `المادة: ${String(body.subject||"المادة").slice(0,100)}
المهمة: ${mode}
التفاصيل: ${JSON.stringify(details).slice(0,5000)}
مقتطفات المصادر:
${contextText}
أجب بخطوات واضحة، واذكر بوضوح إن لم تتوفر مصادر كافية.`;
  const parts = [{text:userText}];
  if (body.image && typeof body.image === "string" && body.image.length < 14_000_000) {
    const mime = ["image/jpeg","image/png","image/webp","image/heic"].includes(body.mimeType) ? body.mimeType : "image/jpeg";
    parts.push({inline_data:{mime_type:mime,data:body.image}});
  } else if (body.image) {
    return Response.json({error:"الصورة كبيرة جدًا. صغّرها أو ارفع صورة أوضح وأصغر."},{status:413});
  }
  const model = env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:SYSTEM}]},
        contents:[{role:"user",parts}],
        generationConfig:{temperature:0.25,maxOutputTokens:2400}
      })
    });
  } catch {
    return Response.json({error:"تعذر الوصول إلى خدمة الذكاء الاصطناعي. جرّب لاحقًا."},{status:502});
  }
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const msg = data?.error?.message || "خدمة الذكاء الاصطناعي لم تقبل الطلب.";
    return Response.json({error:msg.slice(0,400)},{status:response.status===429?429:502});
  }
  const answer = (data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("\n").trim();
  if (!answer) return Response.json({error:"لم يصل رد نصي من النموذج. جرّب مرة أخرى."},{status:502});
  return Response.json({answer});
}
