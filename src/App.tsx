import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { SidebarRail } from "./components/SidebarRail";
import { CenterDealView } from "./components/CenterDealView";
import { RightBentoPanel } from "./components/RightBentoPanel";
import { PipelineKanban } from "./components/PipelineKanban";
import { ProductCatalog } from "./components/ProductCatalog";
import { MetaCampaigns } from "./components/MetaCampaigns";
import { AutomationSuite } from "./components/automations/AutomationSuite";
import { ContentCenter } from "./components/social/ContentCenter";
import { SocialSellerDashboard } from "./components/social-seller/SocialSellerDashboard";
import { BusinessSettingsModal } from "./components/BusinessSettingsModal";
import { PaymentLinkModal } from "./components/PaymentLinkModal";
import { NewLeadModal } from "./components/NewLeadModal";
import {
  MessageSquare,
  Kanban,
  Package,
  Send,
  Sparkles,
  Sliders,
  Plus,
  AlertTriangle,
  ExternalLink,
  Bot,
} from "lucide-react";

import {
  Lead,
  Product,
  BusinessProfile,
  Campaign,
  LeadStatus,
  Message,
  AICloseStrategyResponse,
} from "./types";
import {
  initialBusinessProfile,
  initialProducts,
  initialLeads,
  initialCampaigns,
} from "./data/initialData";

export default function App() {
  // Persistent or initial states
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(() => {
    const saved = localStorage.getItem("metacloser_business_profile");
    return saved ? JSON.parse(saved) : initialBusinessProfile;
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem("metacloser_products");
    if (saved && !saved.includes("Private Asset") && !saved.includes("Aureus")) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return initialProducts;
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem("metacloser_leads");
    return saved ? JSON.parse(saved) : initialLeads;
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    const saved = localStorage.getItem("metacloser_campaigns");
    return saved ? JSON.parse(saved) : initialCampaigns;
  });

  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id || "lead-1");
  const [currentTab, setCurrentTab] = useState<"inbox" | "pipeline" | "catalog" | "campaigns" | "content" | "social-seller">("social-seller");
  const [mobileInboxView, setMobileInboxView] = useState<"list" | "chat">("list");
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [isSyncingMessenger, setIsSyncingMessenger] = useState(false);
  const [deliveryWarning, setDeliveryWarning] = useState<{
    leadName: string;
    warning: string;
  } | null>(null);

  // Function to load CRM state from Cloud SQL backend
  const loadCrmData = async () => {
    try {
      const res = await fetch("/api/crm/state");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.workspace) setBusinessProfile(json.data.workspace);
        if (json.data.products?.length > 0) {
          const localSaved = localStorage.getItem("metacloser_products");
          const hasOldLuxuryMock = localSaved && (localSaved.includes("Aureus") || localSaved.includes("Private Asset") || localSaved.includes("prod-1"));
          if (!localSaved || hasOldLuxuryMock) {
            setProducts(json.data.products);
            localStorage.setItem("metacloser_products", JSON.stringify(json.data.products));
          }
        }
        if (json.data.campaigns?.length > 0) setCampaigns(json.data.campaigns);
        if (json.data.leads?.length > 0) {
          setLeads(json.data.leads);
          setSelectedLeadId((prev) => {
            const exists = json.data.leads.some((l: Lead) => l.id === prev);
            return exists ? prev : json.data.leads[0].id;
          });
        }
        setIsDbLoaded(true);
      }
    } catch (err) {
      console.warn("Using offline/cached CRM state:", err);
    }
  };

  // Fetch initial CRM state from backend and auto-refresh every 4s for real-time inbox
  useEffect(() => {
    loadCrmData();
    const interval = setInterval(loadCrmData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Manual & automated Meta Messenger sync trigger
  const handleSyncMessenger = async () => {
    setIsSyncingMessenger(true);
    try {
      const res = await fetch("/api/crm/messenger/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      console.log("Messenger sync response:", data);
      await loadCrmData();
    } catch (err) {
      console.error("Failed to sync Messenger chats:", err);
    } finally {
      setIsSyncingMessenger(false);
    }
  };


  // AI Strategy state for RightBentoPanel
  const [aiStrategy, setAiStrategy] = useState<AICloseStrategyResponse | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);

  // Sync with local storage
  useEffect(() => {
    localStorage.setItem("metacloser_business_profile", JSON.stringify(businessProfile));
  }, [businessProfile]);

  useEffect(() => {
    localStorage.setItem("metacloser_products", JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem("metacloser_leads", JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem("metacloser_campaigns", JSON.stringify(campaigns));
  }, [campaigns]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || leads[0];

  // Send message in current lead's conversation
  const handleSendMessage = async (
    text: string,
    type: Message["type"] = "text",
    metaData?: any,
    sender: Message["sender"] = "agent"
  ) => {
    if (!selectedLead) return;

    const now = new Date();
    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      sender,
      content: text,
      timestamp: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      createdAt: now.toISOString(),
      type,
      metaData,
    };

    const updatedLead: Lead = {
      ...selectedLead,
      lastMessage: type === "audio" ? "🎤 Nota confidencial fiduciaria" : type === "payment_link" ? "🛡️ Custodia Escrow asignada" : text,
      lastActivity: "Justo ahora",
      unreadCount: sender === "customer" ? selectedLead.unreadCount + 1 : 0,
      conversationHistory: [...selectedLead.conversationHistory, newMessage],
    };

    setLeads((prev) => prev.map((l) => (l.id === selectedLead.id ? updatedLead : l)));

    // Persist to Cloud SQL backend
    try {
      fetch("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          message: newMessage,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success && data.warning) {
            setDeliveryWarning({
              leadName: selectedLead.name,
              warning: data.warning,
            });
            // Update message status in conversation history
            setLeads((prev) =>
              prev.map((l) => {
                if (l.id !== selectedLead.id) return l;
                return {
                  ...l,
                  conversationHistory: l.conversationHistory.map((m) =>
                    m.id === newMessage.id
                      ? { ...m, deliveryStatus: "failed", deliveryError: data.warning }
                      : m
                  ),
                };
              })
            );
          }
        })
        .catch((e) => console.warn("Failed to persist message to Cloud SQL:", e));
    } catch (e) {
      console.warn("Message sync error:", e);
    }

    // If Auto-Pilot is enabled and a customer sends a message, trigger automated high-converting AI reply
    if (sender === "customer" && businessProfile.autoPilotMode) {
      setTimeout(async () => {
        try {
          const product = products.find((p) => p.id === updatedLead.interestProductId) || products[0];
          const res = await fetch("/api/ai/advisor-strategy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadName: updatedLead.name,
              channel: updatedLead.channel,
              businessProfile,
              productContext: product,
              conversationHistory: [...updatedLead.conversationHistory, newMessage].slice(-5),
            }),
          });
          const data = await res.json();
          if (data.success && data.data?.primaryResponse) {
            handleSendMessage(data.data.primaryResponse, "text", undefined, "ai_autopilot");
          }
        } catch (e) {
          console.error("Autopilot error:", e);
        }
      }, 1200);
    }
  };

  // Generate AI strategy from RightBentoPanel
  const handleGenerateAiStrategy = async (technique?: string) => {
    if (!selectedLead) return;
    setIsLoadingAi(true);
    try {
      const product = products.find((p) => p.id === selectedLead.interestProductId) || products[0];
      const res = await fetch("/api/ai/advisor-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: selectedLead.name,
          channel: selectedLead.channel,
          businessProfile,
          productContext: product,
          conversationHistory: selectedLead.conversationHistory.slice(-6),
          requestedTechnique: technique,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAiStrategy(data.data);
      }
    } catch (e) {
      console.error("Error generating AI strategy:", e);
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Update lead status/stage
  const handleUpdateLeadStatus = (newStatus: LeadStatus) => {
    if (!selectedLead) return;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === selectedLead.id
          ? {
              ...l,
              status: newStatus,
              urgency: newStatus === "won_closed" ? "cold" : l.urgency,
            }
          : l
      )
    );

    // Persist to Cloud SQL
    fetch("/api/crm/deals/stage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: selectedLead.id, newStage: newStatus }),
    }).catch((e) => console.warn("Cloud SQL stage sync error:", e));
  };

  const handleUpdateLeadStatusById = (leadId: string, newStatus: LeadStatus) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );

    // Persist to Cloud SQL
    fetch("/api/crm/deals/stage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, newStage: newStatus }),
    }).catch((e) => console.warn("Cloud SQL stage sync error:", e));
  };

  // Send payment link bubble to chat
  const handleSendPaymentLinkToChat = (url: string, amount: number, note: string) => {
    handleSendMessage(note, "payment_link", { paymentUrl: url, amount }, "agent");
    handleUpdateLeadStatus("ready_to_close");
  };

  // Send product card to chat
  const handleSendProductToChat = (prod: Product) => {
    if (!selectedLead) return;
    const msg = `Adjunto memorando y especificaciones técnicas fiduciarias del mandato *${prod.name}* (${prod.tagline || ""}) con garantías de custodia activa 🛡️:`;
    handleSendMessage(msg, "product_card", { product: prod }, "agent");
    setCurrentTab("inbox");
  };

  // Add newly created lead
  const handleAddLead = (newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
    setSelectedLeadId(newLead.id);
    setCurrentTab("inbox");

    // Persist to Cloud SQL
    fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newLead.name,
        phone: newLead.handleOrPhone,
        email: newLead.email,
        channel: newLead.channel,
        productId: newLead.interestProductId || "prod-1",
        notes: newLead.notes,
        estimatedValue: newLead.estimatedValue,
      }),
    }).catch((e) => console.warn("Cloud SQL lead creation sync error:", e));
  };

  return (
    <div className="h-screen w-screen bg-[#f0f2f5] text-slate-800 flex flex-col font-sans selection:bg-emerald-500 selection:text-white overflow-hidden pb-16 lg:pb-0">
      {/* Main Responsive Application Viewport */}
      <main className="flex-1 flex overflow-hidden w-full h-full">
        {/* Left Rail & Lead list: On desktop it is always visible; on mobile it shows in 'inbox' tab when mobileInboxView === 'list' */}
        {(currentTab !== "inbox" ? (
          <div className="hidden lg:flex h-full">
            <SidebarRail
              currentTab={currentTab}
              setCurrentTab={(t) => {
                setCurrentTab(t);
                setMobileInboxView("list");
              }}
              leads={leads}
              selectedLeadId={selectedLeadId}
              onSelectLead={(l) => {
                setSelectedLeadId(l.id);
                setAiStrategy(null);
                setCurrentTab("inbox");
                setMobileInboxView("chat");
              }}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onNewLeadClick={() => setIsNewLeadModalOpen(true)}
              businessProfile={businessProfile}
              onSyncMessenger={handleSyncMessenger}
              isSyncingMessenger={isSyncingMessenger}
            />
          </div>
        ) : (
          <div className={`${mobileInboxView === "list" ? "flex w-full" : "hidden lg:flex"} lg:w-auto h-full flex-shrink-0`}>
            <SidebarRail
              currentTab={currentTab}
              setCurrentTab={(t) => {
                setCurrentTab(t);
                setMobileInboxView("list");
              }}
              leads={leads}
              selectedLeadId={selectedLeadId}
              onSelectLead={(l) => {
                setSelectedLeadId(l.id);
                setAiStrategy(null);
                setCurrentTab("inbox");
                setMobileInboxView("chat");
              }}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onNewLeadClick={() => setIsNewLeadModalOpen(true)}
              businessProfile={businessProfile}
              onSyncMessenger={handleSyncMessenger}
              isSyncingMessenger={isSyncingMessenger}
            />
          </div>
        ))}

        {/* Right Main Content Area depending on Tab */}
        {currentTab === "inbox" && (
          <div className={`${mobileInboxView === "chat" ? "flex w-full" : "hidden lg:flex"} flex-1 h-full overflow-hidden`}>
            {selectedLead ? (
              <CenterDealView
                lead={selectedLead}
                onSendMessage={handleSendMessage}
                onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
                onOpenProductModal={() => setIsPaymentModalOpen(true)}
                onMarkWon={() => handleUpdateLeadStatus("won_closed")}
                products={products}
                businessProfile={businessProfile}
                onBackToList={() => setMobileInboxView("list")}
              />
            ) : (
              <div className="flex-1 chat-bg flex items-center justify-center p-6 sm:p-8">
                <div className="bg-white/80 backdrop-blur px-6 py-3 rounded-full text-slate-500 font-medium text-sm shadow-sm border border-slate-200/50">
                  Selecciona una conversación para abrir el gestor de chat
                </div>
              </div>
            )}
          </div>
        )}

        {currentTab === "pipeline" && (
          <div className="flex-1 h-full overflow-hidden w-full">
            <PipelineKanban
              leads={leads}
              onSelectLead={(l) => {
                setSelectedLeadId(l.id);
                setCurrentTab("inbox");
                setMobileInboxView("chat");
              }}
              onUpdateLeadStatus={handleUpdateLeadStatusById}
              businessProfile={businessProfile}
              onNewLeadClick={() => setIsNewLeadModalOpen(true)}
            />
          </div>
        )}

        {currentTab === "catalog" && (
          <div className="flex-1 h-full overflow-hidden w-full">
            <ProductCatalog
              products={products}
              setProducts={setProducts}
              businessProfile={businessProfile}
              onSendProductToChat={handleSendProductToChat}
            />
          </div>
        )}

        {currentTab === "campaigns" && (
          <div className="flex-1 h-full overflow-hidden w-full">
            <AutomationSuite
              products={products}
              leads={leads}
              businessProfile={businessProfile}
            />
          </div>
        )}

        {currentTab === "content" && (
          <div className="flex-1 h-full overflow-hidden w-full">
            <ContentCenter
              products={products}
              businessProfile={businessProfile}
            />
          </div>
        )}

        {currentTab === "social-seller" && (
          <div className="flex-1 h-full overflow-hidden w-full">
            <SocialSellerDashboard
              products={products}
              leads={leads}
              businessProfile={businessProfile}
              onNavigateToLead={(leadId) => {
                setSelectedLeadId(leadId);
                setCurrentTab("inbox");
                setMobileInboxView("chat");
              }}
            />
          </div>
        )}
      </main>

      {/* Mobile Bottom Floating Navigation Bar (shown on screens < lg) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200/90 px-3 py-1.5 flex items-center justify-around z-30 shadow-lg">
        <button
          onClick={() => {
            setCurrentTab("inbox");
            setMobileInboxView("list");
          }}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
            currentTab === "inbox"
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[10px]">Chats</span>
        </button>

        <button
          onClick={() => setCurrentTab("pipeline")}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
            currentTab === "pipeline"
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Kanban className="w-4 h-4" />
          <span className="text-[10px]">Embudo</span>
        </button>

        <button
          onClick={() => setCurrentTab("catalog")}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
            currentTab === "catalog"
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Package className="w-4 h-4" />
          <span className="text-[10px]">Catálogo</span>
        </button>

        <button
          onClick={() => setCurrentTab("campaigns")}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
            currentTab === "campaigns"
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Send className="w-4 h-4" />
          <span className="text-[10px]">Campañas</span>
        </button>

        <button
          onClick={() => setCurrentTab("content")}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
            currentTab === "content"
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px]">Social</span>
        </button>

        <button
          onClick={() => setCurrentTab("social-seller")}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${
            currentTab === "social-seller"
              ? "text-indigo-600 font-bold"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Bot className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px]">Seller AI</span>
        </button>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 hover:text-slate-800 transition-all"
        >
          <Sliders className="w-4 h-4" />
          <span className="text-[10px]">Ajustes</span>
        </button>
      </nav>

      {/* Modals */}
      <BusinessSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        businessProfile={businessProfile}
        setBusinessProfile={setBusinessProfile}
      />

      <PaymentLinkModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        products={products}
        businessProfile={businessProfile}
        onSendPaymentLinkToChat={handleSendPaymentLinkToChat}
      />

      <NewLeadModal
        isOpen={isNewLeadModalOpen}
        onClose={() => setIsNewLeadModalOpen(false)}
        onAddLead={handleAddLead}
        products={products}
        businessProfile={businessProfile}
      />

      {/* 24-Hour Policy Delivery Warning Floating Notification */}
      {deliveryWarning && (
        <div className="fixed top-5 right-5 z-50 max-w-md bg-slate-900/95 border-2 border-amber-500/80 text-white p-4 rounded-2xl shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-bold text-amber-300 text-sm mb-1 flex items-center justify-between">
              <span>Mensaje no enviado a Facebook</span>
              <button
                onClick={() => setDeliveryWarning(null)}
                className="text-slate-400 hover:text-white p-1 text-xs font-bold leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-200 leading-relaxed mb-3">
              {deliveryWarning.warning}
            </p>
            <div className="flex items-center gap-2">
              <a
                href="https://business.facebook.com/latest/inbox"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors text-xs shadow-md shadow-blue-600/30"
              >
                <span>Abrir Meta Business Suite</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setDeliveryWarning(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg font-medium transition-colors text-xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

