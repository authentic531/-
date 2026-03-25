import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Search, Printer, AlertTriangle, CheckSquare, BookOpen, ShieldAlert, Loader2, History, Settings, Key } from 'lucide-react';

const formatSafetyText = (text: string) => {
  if (!text) return null;
  let formatted = text.replace(/(금지|위험|초과|추락|붕괴|감전|사망|주의|경고|필수|접근금지|질식)/g, '<span class="text-red-600 font-extrabold text-[1.05em]">$1</span>');
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<span class="bg-yellow-200 text-slate-900 font-bold px-1.5 py-0.5 rounded-md shadow-sm">$1</span>');
  return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
};

const renderListItem = (text: string) => {
  if (!text) return null;
  const colonIndex = text.indexOf(':');
  if (colonIndex !== -1) {
    const left = text.substring(0, colonIndex + 1);
    const right = text.substring(colonIndex + 1);
    const cleanLeft = left.replace(/\*\*/g, '');
    let formattedRight = right.replace(/(금지|위험|초과|추락|붕괴|감전|사망|주의|경고|필수|접근금지|질식)/g, '<span class="text-red-600 font-extrabold text-[1.05em]">$1</span>');
    formattedRight = formattedRight.replace(/\*\*(.*?)\*\*/g, '<span class="bg-yellow-200 text-slate-900 font-bold px-1.5 py-0.5 rounded-md shadow-sm">$1</span>');
    return (
      <span>
        <span className="font-bold text-slate-800 mr-1">{cleanLeft}</span>
        <span dangerouslySetInnerHTML={{ __html: formattedRight }} />
      </span>
    );
  }
  return formatSafetyText(text);
};

interface AccidentCase {
  title: string;
  cause: string;
  countermeasure: string;
}

interface Regulations {
  isha: string[];
  kcs: string[];
  kosha: string[];
}

interface TBMData {
  processDescription: string[];
  precautions?: string[];
  regulations?: Regulations;
  checklist: string[];
  accidentCases: AccidentCase[] | string[];
}

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TBMData | null>(null);
  const [error, setError] = useState('');
  const [checklistState, setChecklistState] = useState<Record<number, 'O' | 'X' | null>>({});
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('smart_tbm_recent');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse recent searches', e);
      }
    }
    const savedKey = localStorage.getItem('smart_tbm_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const handleReset = () => {
    setQuery('');
    setData(null);
    setError('');
    setChecklistState({});
  };

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;

    setQuery(searchTerm);
    setLoading(true);
    setError('');
    setData(null);
    setChecklistState({});
    setIsFocused(false);

    const newRecent = [searchTerm, ...recentSearches.filter(q => q !== searchTerm)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('smart_tbm_recent', JSON.stringify(newRecent));

    try {
      const keyToUse = apiKey || process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        setError('API 키가 설정되지 않았습니다. 우측 상단의 설정(⚙️)에서 API 키를 입력해주세요.');
        setLoading(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: keyToUse });
      const prompt = `
너는 대한민국 건설 현장의 베테랑 안전 관리자이자 공사 감독관이야.
사용자가 입력한 당일 작업 공정: "${searchTerm}"

네가 학습한 [표준시방서(KCS)]와 [산업안전보건법 및 관련 안전규칙]을 바탕으로 현장 작업자들이 TBM(Tool Box Meeting) 시간에 직관적으로 이해할 수 있는 안전 가이드를 작성해 줘.
구글 검색(Grounding)을 적극 활용하여 최신 정보를 참고할 것.

[작성 지침]
1. 문체는 현장 작업자가 스마트폰으로 빠르게 읽기 좋도록 간결하고 명확하게 개조식으로 작성할 것.
2. 거짓된 정보(환각)를 만들어내지 말고 오직 신뢰할 수 있는 문서에 기반할 것.
3. 핵심 키워드나 수치, 기준은 반드시 **키워드** 형태로 강조할 것 (예: **안전대**, **2m 이상**).
4. '작업 유의사항'은 반드시 순서대로 번호(1., 2., 3....)를 매겨서 작성할 것.
5. '작업 유의사항'과 '관련 안전 기준 및 법규' 항목에서 콜론(:)을 사용할 경우, 콜론 왼쪽 텍스트에는 절대로 **강조** 기호를 쓰지 말고 콜론 오른쪽의 핵심 내용에만 **강조** 기호를 사용할 것.
6. 반드시 아래 4가지 양식을 엄격하게 지켜서 JSON 형식으로만 답변해줘. 다른 설명은 일절 생략하고 오직 JSON 데이터만 출력해.

{
  "processDescription": ["1. 첫번째 작업 절차: 핵심 내용", "2. 두번째 작업 절차: 핵심 내용", ...],
  "regulations": {
    "isha": ["산업안전보건기준에 관한 규칙 제00조: 핵심 내용", ...],
    "kcs": ["KCS 00 00 00: 핵심 내용", ...],
    "kosha": ["C-00-2023: 핵심 내용", ...]
  },
  "checklist": ["현장에서 즉시 확인할 수 있는 O/X 형태의 질문 1 (5~7개 작성)", ...],
  "accidentCases": [
    {
      "title": "사고 요약 (예: 작업 발판 붕괴로 인한 추락)",
      "cause": "사고 발생 핵심 원인 (이 항목에만 **키워드** 강조를 사용할 것)",
      "countermeasure": "재해 예방 대책"
    }
  ]
}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          // tools: [{ googleSearch: {} }], // 무료 티어/신규 키에서 429 에러(할당량 초과)를 유발할 수 있어 임시 비활성화
          temperature: 0.2,
        }
      });

      const text = response.text || '';
      let parsedData: TBMData;
      
      try {
        const match = text.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
        if (match) {
          parsedData = JSON.parse(match[1]);
        } else {
          // Attempt to find JSON object if markdown block is missing
          const jsonStart = text.indexOf('{');
          const jsonEnd = text.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            parsedData = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
          } else {
            parsedData = JSON.parse(text);
          }
        }
      } catch (parseErr) {
        console.error("JSON Parse Error:", parseErr, text);
        throw new Error("응답 형식을 처리할 수 없습니다.");
      }
      
      setData(parsedData);
    } catch (err: any) {
      console.error(err);
      if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
        setError('API 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요. (Rate Limit Exceeded)');
      } else {
        setError(err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const handlePrint = () => {
    window.print();
  };

  const toggleChecklist = (index: number, value: 'O' | 'X') => {
    setChecklistState(prev => ({
      ...prev,
      [index]: prev[index] === value ? null : value
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <div className="h-2 w-full bg-safety-stripe fixed top-0 z-50"></div>
      {/* Header */}
      <header className="bg-slate-900 border-b-4 border-yellow-400 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-2 z-10 shadow-md">
        <button onClick={handleReset} className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left">
          <ShieldAlert className="w-8 h-8 text-yellow-400" />
          <h1 className="text-2xl font-black text-yellow-400 tracking-tight">SMART TBM</h1>
        </button>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex flex-col items-start sm:items-end text-xs sm:text-sm font-medium text-slate-300 bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-700 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white">📍 현장: 경남 진주</span>
              <span className="hidden sm:inline text-slate-500">|</span>
              <span>☀️ 맑음 17°C</span>
            </div>
            <div className="text-yellow-400 mt-1 font-bold">
              💨 풍속 2m/s (타워크레인 및 고소작업 양호)
            </div>
          </div>
          
          {/* API Key Settings */}
          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors flex-shrink-0"
              title="API 키 설정"
            >
              <Settings className="w-5 h-5" />
            </button>
            {showSettings && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
                <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold">
                  <Key className="w-4 h-4 text-yellow-500" />
                  <span>Gemini API 키 설정</span>
                </div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  개인 API 키를 입력하세요. 키는 브라우저에만 안전하게 저장되며 서버로 전송되지 않습니다.
                </p>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    localStorage.setItem('smart_tbm_api_key', e.target.value);
                  }}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 mb-3"
                />
                <div className="flex justify-end">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="text-xs font-bold bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    확인 및 닫기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-8">
        
        {/* Search Section */}
        <section className="flex flex-col items-center justify-center mt-8 mb-4">
          <h2 className="text-3xl font-black text-slate-800 mb-6 text-center tracking-tight leading-snug">
            안전한 작업의 시작 <br className="sm:hidden" />
            <span className="text-slate-900 bg-yellow-400 px-2 py-0.5 rounded-md inline-block mx-1 shadow-sm">SMART TBM</span>을 통해 점검하세요
          </h2>
          <form onSubmit={handleSearch} className="w-full max-w-2xl relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
              placeholder="오늘의 작업을 입력하세요 (예: 거푸집 조립, 철근 배근)"
              className="w-full pl-14 pr-6 py-4 text-lg rounded-2xl border-2 border-slate-300 focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/20 outline-none transition-all shadow-sm font-medium"
            />
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
            <button 
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-yellow-400 hover:bg-yellow-500 disabled:bg-slate-300 text-slate-900 px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '검색'}
            </button>

            {/* Recent Searches Dropdown */}
            {isFocused && recentSearches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  최근 검색 내역
                </div>
                <ul className="max-h-60 overflow-y-auto">
                  {recentSearches.map((term, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 text-slate-700 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0"
                        onClick={() => performSearch(term)}
                      >
                        <Search className="w-4 h-4 text-slate-400" />
                        {term}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>

          <div className="mt-4 text-sm text-slate-500 flex flex-wrap items-center justify-center gap-2 font-medium">
            <span className="text-slate-600">상세 검색 예시:</span>
            <button onClick={() => performSearch('시스템 비계 조립 및 해체')} className="px-3 py-1.5 bg-white border border-slate-300 rounded-full hover:border-slate-900 hover:bg-slate-900 hover:text-yellow-400 transition-colors shadow-sm">시스템 비계 조립 및 해체</button>
            <button onClick={() => performSearch('갱폼 인양 작업')} className="px-3 py-1.5 bg-white border border-slate-300 rounded-full hover:border-slate-900 hover:bg-slate-900 hover:text-yellow-400 transition-colors shadow-sm">갱폼 인양 작업</button>
            <button onClick={() => performSearch('철골 세우기')} className="px-3 py-1.5 bg-white border border-slate-300 rounded-full hover:border-slate-900 hover:bg-slate-900 hover:text-yellow-400 transition-colors shadow-sm">철골 세우기</button>
            <button onClick={() => performSearch('타워크레인 설치')} className="px-3 py-1.5 bg-white border border-slate-300 rounded-full hover:border-slate-900 hover:bg-slate-900 hover:text-yellow-400 transition-colors shadow-sm">타워크레인 설치</button>
          </div>

          {error && (
            <div className="mt-4 text-red-500 flex items-center gap-2 bg-red-50 px-4 py-2 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* Results Grid */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Card 1: Process Description */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-200 border-t-4 border-t-blue-600 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">작업 유의사항</h3>
              </div>
              <ul className="space-y-3 flex-1">
                {data.processDescription.map((item, idx) => (
                  <li key={idx} className="flex gap-3 text-slate-700 leading-relaxed text-base md:text-lg">
                    <span>{renderListItem(item)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 2: Regulations */}
            <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 flex flex-col h-full overflow-hidden relative">
              <div className="h-4 w-full bg-safety-stripe absolute top-0 left-0"></div>
              <div className="p-6 pt-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">관련 안전 기준 및 법규</h3>
                </div>
                <div className="flex-1 space-y-5">
                  {data.regulations ? (
                    <>
                      <div>
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                          <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md text-sm shadow-sm border border-amber-200">산업안전보건법</span>
                        </h4>
                        <ul className="space-y-2 pl-1">
                          {data.regulations.isha.map((item, idx) => (
                            <li key={idx} className="flex gap-2 text-slate-700 leading-relaxed text-sm md:text-base">
                              <span>{renderListItem(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                          <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md text-sm shadow-sm border border-blue-200">KCS (표준시방서)</span>
                        </h4>
                        <ul className="space-y-2 pl-1">
                          {data.regulations.kcs.map((item, idx) => (
                            <li key={idx} className="flex gap-2 text-slate-700 leading-relaxed text-sm md:text-base">
                              <span>{renderListItem(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md text-sm shadow-sm border border-emerald-200">KOSHA GUIDE</span>
                        </h4>
                        <ul className="space-y-2 pl-1">
                          {data.regulations.kosha.map((item, idx) => (
                            <li key={idx} className="flex gap-2 text-slate-700 leading-relaxed text-sm md:text-base">
                              <span>{renderListItem(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <ul className="space-y-3">
                      {data.precautions?.map((item, idx) => (
                        <li key={idx} className="flex gap-3 text-slate-700 leading-relaxed text-base md:text-lg">
                          <span>{renderListItem(item)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Checklist */}
            <div id="printable-checklist" className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-200 border-t-4 border-t-emerald-500 flex flex-col h-full md:col-span-2">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                    <CheckSquare className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">필수 안전 체크리스트 (작업자용)</h3>
                </div>
                <button 
                  onClick={handlePrint}
                  className="no-print flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors bg-slate-100 hover:bg-yellow-400 px-4 py-2 rounded-xl border border-slate-200"
                >
                  <Printer className="w-5 h-5" />
                  인쇄
                </button>
              </div>
              
              <div className="print-only hidden mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-center mb-2">{query} 작업 안전 체크리스트</h2>
                <p className="text-center text-slate-500 mb-4">점검일자: {today}</p>
              </div>

              <ul className="space-y-4 flex-1">
                {data.checklist.map((item, idx) => (
                  <li key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors border-2 border-slate-100">
                    <span className="text-slate-800 font-bold text-base md:text-lg leading-relaxed flex-1">
                      {formatSafetyText(item)}
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto">
                      <button
                        onClick={() => toggleChecklist(idx, 'O')}
                        className={`flex-1 sm:w-24 h-14 md:h-16 rounded-xl flex items-center justify-center border-4 transition-all text-2xl md:text-3xl font-black ${
                          checklistState[idx] === 'O' 
                            ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-105' 
                            : 'bg-white border-slate-200 text-slate-300 hover:border-emerald-400 hover:text-emerald-500'
                        }`}
                      >
                        O
                      </button>
                      <button
                        onClick={() => toggleChecklist(idx, 'X')}
                        className={`flex-1 sm:w-24 h-14 md:h-16 rounded-xl flex items-center justify-center border-4 transition-all text-2xl md:text-3xl font-black ${
                          checklistState[idx] === 'X' 
                            ? 'bg-red-600 border-red-700 text-white shadow-lg shadow-red-600/30 scale-105' 
                            : 'bg-white border-slate-200 text-slate-300 hover:border-red-400 hover:text-red-500'
                        }`}
                      >
                        X
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 4: Accident Cases */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-200 border-t-4 border-t-red-600 flex flex-col h-full md:col-span-2">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                <div className="p-2 bg-red-100 rounded-lg text-red-700">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight">유사 작업 재해 사례</h3>
              </div>
              <ul className="space-y-4 flex-1">
                {data.accidentCases.map((item, idx) => {
                  if (typeof item === 'string') {
                    return (
                      <li key={idx} className="flex gap-3 text-slate-700 leading-relaxed bg-rose-50/50 p-5 rounded-xl border border-rose-100 text-base md:text-lg">
                        <span>{formatSafetyText(item)}</span>
                      </li>
                    );
                  }
                  return (
                    <li key={idx} className="flex flex-col gap-3 bg-white p-5 rounded-2xl border-2 border-rose-100 shadow-sm">
                      <div className="flex items-center gap-2 font-black text-rose-700 text-base md:text-lg border-b-2 border-rose-50 pb-3 mb-1">
                        <AlertTriangle className="w-5 h-5" />
                        {item.title ? item.title.replace(/\*\*/g, '') : '재해 사례'}
                      </div>
                      <div className="flex flex-col gap-3 text-base md:text-lg">
                        <div className="flex gap-3 items-start">
                          <span className="bg-rose-100 text-rose-800 font-bold px-3 py-1 rounded-lg text-sm whitespace-nowrap mt-0.5 shadow-sm border border-rose-200">원인</span>
                          <span className="text-slate-800 leading-relaxed font-medium">{formatSafetyText(item.cause)}</span>
                        </div>
                        <div className="flex gap-3 items-start">
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-lg text-sm whitespace-nowrap mt-0.5 shadow-sm border border-emerald-200">대책</span>
                          <span className="text-slate-700 leading-relaxed">{item.countermeasure ? item.countermeasure.replace(/\*\*/g, '') : ''}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 px-6 text-sm mt-auto flex flex-col md:flex-row justify-between items-center md:items-end gap-4">
        <div className="text-center md:text-left opacity-60 max-w-2xl">
          본 서비스는 AI를 활용하여 작성되었으며, 실제 현장 적용 시 관련 법령 및 지침을 반드시 교차 검증하시기 바랍니다.
        </div>
        <div className="text-center md:text-right">
          <p className="font-medium text-slate-300">개발자: 경상국립대학교 하지운</p>
          <p className="mt-1">Tel: 010-8522-8914</p>
        </div>
      </footer>
    </div>
  );
}
