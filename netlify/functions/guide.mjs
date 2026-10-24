const SYSTEM_PROMPT = `Bạn là Hướng dẫn viên Bảo tàng TP.HCM, thân thiện, nói tiếng Việt tự nhiên kiểu gần gũi (có thể xưng tui/bà nếu người dùng nói vậy). Nhiệm vụ: hiểu sở thích, gợi ý bảo tàng và xây lịch trình tham quan dựa CHỈ trên dữ liệu bảo tàng được gửi kèm. Không bịa giờ mở cửa, giá vé, hiện vật, góc chụp, khoảng cách hoặc tình trạng đang mở. Nếu dữ liệu thiếu, nói rõ cần kiểm tra trước khi đi. Trả lời có ích, cụ thể, gọn gàng; có thể hỏi 1 câu tiếp nối khi cần biết ngân sách, thời lượng, chủ đề hoặc người đi cùng. Nếu người dùng hỏi ngoài phạm vi bảo tàng/du lịch TP.HCM, lịch sự kéo lại chủ đề. Không khẳng định mình đã đặt vé hoặc kiểm tra thời gian thực. Cuối cùng, nếu có bảo tàng phù hợp trong danh sách, hãy chọn tối đa 4 id chính xác. BẮT BUỘC trả về JSON hợp lệ với dạng: {"answer":"câu trả lời tiếng Việt","museumIds":["id-1","id-2"]}. Không thêm markdown hay văn bản ngoài JSON.`;

export default async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST' } });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Thiếu biến môi trường OPENAI_API_KEY trên Netlify.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  try {
    const body = await req.json();
    const message = String(body.message || '').trim().slice(0, 2000);
    if (!message) return new Response(JSON.stringify({ error: 'Bà nhập câu hỏi trước nha.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const museums = Array.isArray(body.museums) ? body.museums.slice(0, 60).map(m => ({ id:m.id, name:m.name, address:m.address, district:m.district, tags:m.tags, description:m.description, hours:m.hours, ticket:m.ticket, mapUrl:m.mapUrl })) : [];
    const history = Array.isArray(body.history) ? body.history.slice(-8).map(x => ({ role: x.role === 'assistant' ? 'assistant' : 'user', content: String(x.content || '').slice(0, 1500) })) : [];
    const input = [
      { role: 'user', content: `DỮ LIỆU BẢO TÀNG (nguồn dữ liệu có thể chưa đầy đủ; không suy diễn thành sự thật):\n${JSON.stringify(museums)}\n\nHãy dùng dữ liệu này để tư vấn. Nếu phù hợp, museumIds phải lấy đúng từ trường id.` },
      ...history,
      { role: 'user', content: message }
    ];
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.5', instructions: SYSTEM_PROMPT, input, max_output_tokens: 700 })
    });
    const result = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error('OpenAI API error:', apiResponse.status, result?.error?.message || 'unknown');
      return new Response(JSON.stringify({ error: 'AI API trả về lỗi. Kiểm tra API key, billing và tên model trong Netlify.' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    const text = (result.output || []).flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('\n').trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { answer: text || 'Tui chưa tạo được câu trả lời. Bà thử hỏi lại nha.', museumIds: [] }; }
    const validIds = new Set(museums.map(m => m.id));
    const museumIds = Array.isArray(parsed.museumIds) ? parsed.museumIds.filter(id => validIds.has(id)).slice(0, 4) : [];
    return new Response(JSON.stringify({ answer: String(parsed.answer || 'Bà thử cho tui biết chủ đề hoặc thời gian đi nha.'), museumIds }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Guide function error:', error);
    return new Response(JSON.stringify({ error: 'Có lỗi khi xử lý câu hỏi. Bà thử lại sau nhé.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
