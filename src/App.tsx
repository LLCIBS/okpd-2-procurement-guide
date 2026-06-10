import React, { useState } from "react";
import { Search } from "./components/Search";
import { CodeDetails } from "./components/CodeDetails";
import { AIConsultant } from "./components/AIConsultant";
import { CategoryBrowser } from "./components/CategoryBrowser";
import { ETPList } from "./components/ETPList";
import { TenderSearch } from "./components/TenderSearch";
import { OKPDCode, TenderLawFilter, TenderPlatformFilter } from "./types";
import { BookOpen, HelpCircle, Info, LayoutDashboard, Search as SearchIcon, Settings, Globe } from "lucide-react";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [selectedCode, setSelectedCode] = useState<OKPDCode | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'guide' | 'etp' | 'settings'>('search');
  const [searchQuery, setSearchQuery] = useState("");
  const [tenderSearchKick, setTenderSearchKick] = useState(0);
  const [tenderLawFilter, setTenderLawFilter] = useState<TenderLawFilter>({ law44: true, law223: true });
  const [tenderPlatformFilter, setTenderPlatformFilter] = useState<TenderPlatformFilter>({ eis: true, sberAst: false });

  const navItems = [
    { id: 'search', label: 'Поиск ОКПД 2', icon: SearchIcon },
    { id: 'guide', label: 'Справочник', icon: BookOpen },
    { id: 'etp', label: 'Торговые площадки', icon: Globe },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  const handleSelectCode = (code: OKPDCode) => {
    setSelectedCode(code);
    setSearchQuery(""); // Clear search query when a code is selected to show details
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <LayoutDashboard className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">ОКПД 2</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Гид по закупкам</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                activeTab === item.id 
                  ? "bg-blue-50 text-blue-600 shadow-sm" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 transition-colors",
                activeTab === item.id ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
              )} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-900 rounded-2xl p-4 text-white relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
            <div className="relative z-10">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">PRO Версия</p>
              <p className="text-sm font-medium mb-3">Доступ ко всем судебным практикам</p>
              <button className="w-full py-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors">
                Подключить
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-slate-500">
              {activeTab === 'search' ? 'Поиск особенностей закупок' : 'Справочник'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <HelpCircle className="h-5 w-5" />
            </button>
            <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
              <img src="https://picsum.photos/seed/user/100/100" alt="User" referrerPolicy="no-referrer" />
            </div>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto flex flex-col xl:flex-row gap-8">
            {/* Left Column: Main App Area */}
            <div className="flex-1 space-y-8">
              <AnimatePresence mode="wait">
                {!selectedCode ? (
                  <motion.div
                    key="search-view"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-12"
                  >
                    {activeTab === 'search' ? (
                      <>
                        <div className="text-center space-y-4 max-w-2xl mx-auto pt-12">
                          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                            Найдите особенности закупок за секунды
                          </h2>
                          <p className="text-lg text-slate-500 leading-relaxed">
                            Введите код ОКПД 2, чтобы узнать о запретах, ограничениях, 
                            преференциях и типовых контрактах.
                          </p>
                        </div>

                        <Search 
                          query={searchQuery}
                          onQueryChange={setSearchQuery}
                          onSelect={handleSelectCode}
                          onTenderSearchSubmit={() => setTenderSearchKick((k) => k + 1)}
                        />

                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="pt-8"
                        >
                          <TenderSearch
                            query={searchQuery}
                            searchKick={tenderSearchKick}
                            lawFilter={tenderLawFilter}
                            onLawFilterChange={setTenderLawFilter}
                            platformFilter={tenderPlatformFilter}
                            onPlatformFilterChange={setTenderPlatformFilter}
                          />
                        </motion.div>

                        {!searchQuery && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
                            {[
                              { title: "Актуальность", desc: "Данные обновляются ежедневно согласно 44-ФЗ и 223-ФЗ", icon: Info },
                              { title: "ИИ-Помощник", desc: "Задавайте вопросы по сложным случаям нашему консультанту", icon: LayoutDashboard },
                              { title: "Судебная практика", desc: "Анализ типичных ошибок и решений ФАС", icon: BookOpen },
                            ].map((feature, i) => (
                              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                                  <feature.icon className="h-5 w-5 text-blue-600" />
                                </div>
                                <h3 className="font-bold text-slate-900 mb-2">{feature.title}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : activeTab === 'guide' ? (
                      <div className="pt-8">
                        <CategoryBrowser onSelect={setSelectedCode} />
                      </div>
                    ) : activeTab === 'etp' ? (
                      <div className="pt-8">
                        <ETPList />
                      </div>
                    ) : (
                      <div className="pt-12 text-center">
                        <Settings className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-900">Настройки</h3>
                        <p className="text-slate-500">Раздел находится в разработке</p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="details-view"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <CodeDetails 
                      code={selectedCode} 
                      onBack={() => setSelectedCode(null)} 
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: AI Consultant Sidebar */}
            <aside className="w-full xl:w-96 shrink-0">
              <div className="sticky top-24">
                <AIConsultant selectedCode={selectedCode || undefined} />
                
                <div className="mt-6 bg-blue-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-200">
                  <h4 className="font-bold mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Важное уведомление
                  </h4>
                  <p className="text-xs text-blue-100 leading-relaxed">
                    Информация в сервисе носит справочный характер. Перед принятием решений 
                    обязательно сверяйтесь с официальными текстами нормативных актов на портале 
                    zakupki.gov.ru.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
