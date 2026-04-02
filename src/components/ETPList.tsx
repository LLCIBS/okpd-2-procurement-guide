import React from "react";
import { ExternalLink, ShieldCheck, Globe, Zap, TrendingUp, FileText } from "lucide-react";
import { motion } from "motion/react";

export const etpData = [
  {
    name: "Сбербанк-АСТ",
    url: "https://www.sberbank-ast.ru/",
    description: "Крупнейшая федеральная площадка. Раздел 'База знаний' содержит шаблоны документов.",
    type: "Федеральная"
  },
  {
    name: "РТС-тендер",
    url: "https://www.rts-tender.ru/",
    description: "Лидер по количеству закупок малого объема. Имеет обширный раздел с типовыми формами.",
    type: "Федеральная"
  },
  {
    name: "Росэлторг (ЕЭТП)",
    url: "https://www.roseltorg.ru/",
    description: "Единая электронная торговая площадка. Поддерживает интеграцию с ЕИС по типовым условиям.",
    type: "Федеральная"
  },
  {
    name: "ЭТП ГПБ (Газпромбанк)",
    url: "https://etpgpb.ru/",
    description: "Специализируется на закупках Группы Газпром и крупных госкорпораций по 223-ФЗ.",
    type: "Корпоративная"
  },
  {
    name: "ТЭК-Торг",
    url: "https://www.tektorg.ru/",
    description: "Площадка для закупок Роснефти и РЖД. Публикует типовые требования к участникам.",
    type: "Корпоративная"
  },
  {
    name: "Заказ РФ",
    url: "http://zakazrf.ru/",
    description: "Агентство по государственному заказу Республики Татарстан.",
    type: "Федеральная"
  },
  {
    name: "РАД (Лот-онлайн)",
    url: "https://gz.lot-online.ru/",
    description: "Российский аукционный дом. Работает с госимуществом и закупками по 44-ФЗ.",
    type: "Федеральная"
  },
  {
    name: "Фабрикант",
    url: "https://www.fabrikant.ru/",
    description: "Одна из старейших площадок для коммерческих и государственных закупок.",
    type: "Универсальная"
  },
  {
    name: "B2B-Center",
    url: "https://www.b2b-center.ru/",
    description: "Крупнейшая площадка для коммерческих закупок и 223-ФЗ.",
    type: "Коммерческая"
  },
  {
    name: "ЭТП РАД",
    url: "https://etp.lot-online.ru/",
    description: "Универсальная торговая площадка для торгов всех видов.",
    type: "Универсальная"
  }
];

export function ETPList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">ТОП-10 Торговых площадок (ЭТП)</h3>
        <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {etpData.map((etp, idx) => (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            key={etp.name}
            className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-all group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Globe className="h-12 w-12 text-blue-600" />
            </div>
            
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wider">
                {etp.type}
              </span>
              <a 
                href={etp.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            <h4 className="font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
              {etp.name}
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              {etp.description}
            </p>

            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
              <ShieldCheck className="h-3 w-3" />
              Проверено ЕИС
            </div>
          </motion.div>
        ))}
      </div>
      
      <div className="mt-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-600 rounded-lg shrink-0">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h4 className="font-bold text-blue-900 mb-1">Поиск закупок и другие площадки</h4>
            <p className="text-sm text-blue-800 leading-relaxed mb-4">
              Помимо федеральных площадок, существует множество коммерческих и региональных систем. 
              Полный актуальный список всех систем и порталов (более 200+) доступен в справочнике УЦ Тензор.
            </p>
            <a 
              href="https://tensor.ru/uc/etp" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm"
            >
              Открыть полный список площадок
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-6 p-6 bg-amber-50 rounded-2xl border border-amber-100">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-amber-600 rounded-lg shrink-0">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h4 className="font-bold text-amber-900 mb-1">Важное примечание о типовых контрактах</h4>
            <p className="text-sm text-amber-800 leading-relaxed">
              С 2022 года понятие «типовой контракт» заменено на «типовые условия контракта». 
              Все актуальные шаблоны и условия теперь интегрированы непосредственно в Единую информационную систему (ЕИС) 
              и автоматически применяются при формировании извещения на любой из вышеперечисленных площадок.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
