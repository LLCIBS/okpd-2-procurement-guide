import React from "react";
import { OKPDCode } from "../types";
import { Shield, FileText, AlertTriangle, Scale, CheckCircle2, ArrowLeft, TrendingUp } from "lucide-react";
import { cn } from "../lib/utils";
import { motion } from "motion/react";
import { TenderSearch } from "./TenderSearch";

interface CodeDetailsProps {
  code: OKPDCode;
  onBack: () => void;
}

export function CodeDetails({ code, onBack }: CodeDetailsProps) {
  const sections = [
    {
      title: "Национальный режим",
      icon: Shield,
      color: "text-blue-600 bg-blue-50",
      content: (
        <div className="space-y-4">
          {code.features.nationalTreatment?.bans && (
            <div>
              <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">Запреты</h4>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {code.features.nationalTreatment.bans.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {code.features.nationalTreatment?.restrictions && (
            <div>
              <h4 className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-2">Ограничения</h4>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {code.features.nationalTreatment.restrictions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {code.features.nationalTreatment?.preferences && (
            <div>
              <h4 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Преференции</h4>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {code.features.nationalTreatment.preferences.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )
    },
    {
      title: "Типовые контракты",
      icon: FileText,
      color: "text-purple-600 bg-purple-50",
      content: (
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
          {code.features.standardContracts?.map((item, i) => (
            <li key={i}>{item}</li>
          )) || <li>Типовые контракты не найдены</li>}
        </ul>
      )
    },
    {
      title: "Преимущества СМП и СОНО",
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-50",
      content: (
        <p className="text-sm text-gray-700">
          {code.features.smpSonoPreferences 
            ? "Участникам предоставляются преимущества в соответствии со ст. 30 44-ФЗ."
            : "Преимущества не предусмотрены."}
        </p>
      )
    },
    {
      title: "Типичные ошибки",
      icon: AlertTriangle,
      color: "text-amber-600 bg-amber-50",
      content: (
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
          {code.features.typicalMistakes?.map((item, i) => (
            <li key={i}>{item}</li>
          )) || <li>Ошибки не зафиксированы</li>}
        </ul>
      )
    },
    {
      title: "Нормативная база",
      icon: Scale,
      color: "text-slate-600 bg-slate-50",
      content: (
        <div className="flex flex-wrap gap-2">
          {code.features.legalBasis?.map((item, i) => (
            <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
              {item}
            </span>
          ))}
        </div>
      )
    },
    {
      title: "Коды КТРУ",
      icon: FileText,
      color: "text-blue-600 bg-blue-50",
      content: (
        <div className="space-y-2">
          {code.features.ktru?.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 group/ktru">
              <span className="text-xs font-mono text-slate-600">{item}</span>
              <a 
                href={`https://zakupki.gov.ru/epz/ktru/search/results.html?searchString=${item}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wider"
              >
                Открыть в ЕИС
              </a>
            </div>
          )) || <p className="text-sm text-gray-500 italic">Коды КТРУ не привязаны</p>}
        </div>
      )
    }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <button 
        onClick={onBack}
        className="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 transition-colors group"
      >
        <ArrowLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        Вернуться к поиску
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold bg-blue-600 text-white">
                {code.code}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                {code.name}
              </h1>
            </div>
            <p className="text-gray-500 text-sm max-w-2xl">
              {code.description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map((section, idx) => (
            <div key={idx} className="p-5 rounded-xl border border-gray-100 bg-white hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn("p-2 rounded-lg", section.color)}>
                  <section.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
              </div>
              <div className="pl-1">
                {section.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Tenders Section */}
      <div className="pt-4">
        <TenderSearch query={code.name} />
      </div>
    </div>
  );
}
