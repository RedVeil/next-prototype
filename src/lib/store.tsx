"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"
import { availableCapital as calcAvailable, availableThroughBucket as calcThroughBucket } from "./capital"
import { cloneInvestorProfile, cloneProfile, EMPTY_WALLET } from "./mock-data"
import { appendSoldMark, readSoldMarks, type SoldMark } from "./sold-marks"
import type {
  BucketDraft,
  BucketStatus,
  ConnectionStats,
  InvestmentBucket,
  Investor,
  InvestorPosition,
  InvestorProfileId,
  InvestorTransaction,
  Invoice,
  KybStatus,
  Offer,
  PortfolioHolding,
  RiskScore,
  Seller,
  SellerProfileId,
  SessionRole,
  Settlement,
  Wallet,
} from "./types"

type State = {
  role: SessionRole | null
  profile: SellerProfileId | null
  seller: Seller | null
  invoices: Invoice[]
  riskScores: Record<string, RiskScore>
  offers: Record<string, Offer>
  settlements: Record<string, Settlement>
  soldThisMonthBase: number
  averageFinancingCost: number
  connections: ConnectionStats
  investorProfile: InvestorProfileId | null
  investor: Investor | null
  kybStatus: KybStatus
  wallet: Wallet
  positions: InvestorPosition[]
  buckets: InvestmentBucket[]
  holdings: PortfolioHolding[]
  investorTransactions: InvestorTransaction[]
}

type Action =
  | { type: "SELECT_PROFILE"; profile: SellerProfileId }
  | { type: "SELECT_INVESTOR_PROFILE"; profile: InvestorProfileId }
  | { type: "CLEAR_PROFILE" }
  | { type: "COMPLETE_ONBOARDING"; seller: Seller }
  | { type: "COMPLETE_INVESTOR_ONBOARDING"; investor: Investor; wallet: Wallet }
  | { type: "ADD_INVOICE"; invoice: Invoice; riskScore?: RiskScore }
  | { type: "SELL_INVOICE"; invoiceId: string }
  | { type: "BUYER_REPAID"; invoiceId: string }
  | { type: "SETTLEMENT_PROCESSING"; invoiceId: string }
  | { type: "SETTLEMENT_COMPLETE"; invoiceId: string }
  | { type: "CREATE_BUCKET"; draft: BucketDraft }
  | { type: "UPDATE_BUCKET"; id: string; draft: BucketDraft }
  | { type: "SET_BUCKET_STATUS"; id: string; status: BucketStatus }
  | { type: "DELETE_BUCKET"; id: string }
  | { type: "DEPOSIT"; amount: number }
  | { type: "WITHDRAW"; amount: number }

const emptyConnections: ConnectionStats = {
  lastSynced: "Never",
  invoicesDetected: 0,
  banks: [],
  bankVisibility: 0,
}

function buildAcceptedOffer(invoice: Invoice, finalPrice: number): Offer {
  return {
    invoiceId: invoice.id,
    faceValue: invoice.faceValue,
    finalPrice,
    discountAmount: invoice.faceValue - finalPrice,
    discountPercentage:
      invoice.faceValue > 0 ? ((invoice.faceValue - finalPrice) / invoice.faceValue) * 100 : 0,
    status: "accepted",
  }
}

function applySoldMarks(
  invoices: Invoice[],
  marks: SoldMark[],
): {
  invoices: Invoice[]
  offers: Record<string, Offer>
  settlements: Record<string, Settlement>
} {
  const byId = new Map(marks.map((mark) => [mark.invoiceId, mark]))
  const nextInvoices = invoices.map((invoice) =>
    byId.has(invoice.id) ? { ...invoice, status: "sold" as const } : invoice,
  )
  const offers: Record<string, Offer> = {}
  const settlements: Record<string, Settlement> = {}
  for (const mark of marks) {
    const invoice = nextInvoices.find((item) => item.id === mark.invoiceId)
    if (!invoice) continue
    offers[mark.invoiceId] = buildAcceptedOffer(invoice, mark.sellerReceived)
    settlements[mark.invoiceId] = {
      invoiceId: mark.invoiceId,
      sellerReceived: mark.sellerReceived,
      buyerPayment: "waiting",
      investorSettlement: "waiting",
    }
  }
  return { invoices: nextInvoices, offers, settlements }
}

function prependTransaction(
  transactions: InvestorTransaction[],
  transaction: Omit<InvestorTransaction, "id">,
): InvestorTransaction[] {
  return [
    {
      ...transaction,
      id: `tx-${Date.now()}-${transactions.length}`,
    },
    ...transactions,
  ]
}

function applyDraft(
  draft: BucketDraft,
  base: Pick<InvestmentBucket, "id" | "investorId" | "currentExposure" | "status">,
): InvestmentBucket {
  return {
    ...base,
    name: draft.name.trim(),
    capitalCap: draft.capitalCap,
    requiredApr: draft.requiredApr,
    scoreMin: draft.scoreMin,
    scoreMax: draft.scoreMax,
    industries: draft.industries.length > 0 ? [...draft.industries] : ["Any"],
    tenorMin: draft.tenorMin,
    tenorMax: draft.tenorMax,
    invoiceMin: draft.invoiceMin,
    invoiceMax: draft.invoiceMax,
    minimumConfidence: draft.minimumConfidence,
    minHistoricalInvoices: draft.minHistoricalInvoices,
    minPlatformRepayments: draft.minPlatformRepayments,
    maxLatePaymentRate: draft.maxLatePaymentRate,
    maxBuyerExposure: draft.maxBuyerExposure,
    maxSellerExposure: draft.maxSellerExposure,
    maxBuyerPortfolioPercent: draft.maxBuyerPortfolioPercent,
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SELECT_PROFILE": {
      const catalog = cloneProfile(action.profile)
      const marked = applySoldMarks(catalog.invoices, readSoldMarks(action.profile))
      return {
        ...emptyInvestorSlice,
        role: "seller",
        profile: catalog.id,
        seller: catalog.seller,
        invoices: marked.invoices,
        riskScores: catalog.riskScores,
        offers: marked.offers,
        settlements: marked.settlements,
        soldThisMonthBase: catalog.soldThisMonthBase,
        averageFinancingCost: catalog.averageFinancingCost,
        connections: catalog.connections,
      }
    }
    case "SELECT_INVESTOR_PROFILE": {
      const catalog = cloneInvestorProfile(action.profile)
      return {
        ...emptySellerSlice,
        role: "investor",
        investorProfile: catalog.id,
        investor: catalog.investor,
        kybStatus: catalog.kybStatus,
        wallet: catalog.wallet,
        positions: catalog.positions,
        buckets: catalog.buckets,
        holdings: catalog.holdings,
        investorTransactions: catalog.transactions,
      }
    }
    case "CLEAR_PROFILE": {
      return initialState
    }
    case "COMPLETE_ONBOARDING": {
      return {
        ...state,
        seller: action.seller,
        invoices: state.invoices.map((invoice) => ({
          ...invoice,
          sellerName: action.seller.name,
          sellerCnpj: action.seller.cnpj,
        })),
      }
    }
    case "COMPLETE_INVESTOR_ONBOARDING": {
      return {
        ...state,
        investor: {
          ...(state.investor ?? action.investor),
          ...action.investor,
          status: "verified",
        },
        kybStatus: "approved",
        wallet: { ...action.wallet },
      }
    }
    case "ADD_INVOICE": {
      return {
        ...state,
        invoices: [action.invoice, ...state.invoices],
        riskScores: action.riskScore
          ? { ...state.riskScores, [action.invoice.id]: action.riskScore }
          : state.riskScores,
      }
    }
    case "SELL_INVOICE": {
      const invoice = state.invoices.find((item) => item.id === action.invoiceId)
      if (!invoice || invoice.status === "sold" || invoice.status === "repaid") {
        return state
      }
      if (invoice.status !== "eligible" && invoice.status !== "offer_available") {
        return state
      }
      if (invoice.finalOffer == null) return state
      if (state.profile) {
        appendSoldMark(state.profile, {
          invoiceId: action.invoiceId,
          sellerReceived: invoice.finalOffer,
        })
      }
      return {
        ...state,
        invoices: state.invoices.map((item) =>
          item.id === action.invoiceId ? { ...item, status: "sold" as const } : item,
        ),
        offers: {
          ...state.offers,
          [action.invoiceId]: buildAcceptedOffer(invoice, invoice.finalOffer),
        },
        settlements: {
          ...state.settlements,
          [action.invoiceId]: {
            invoiceId: action.invoiceId,
            sellerReceived: invoice.finalOffer,
            buyerPayment: "waiting",
            investorSettlement: "waiting",
          },
        },
      }
    }
    case "BUYER_REPAID": {
      const settlement = state.settlements[action.invoiceId]
      if (!settlement || settlement.buyerPayment === "received") return state
      return {
        ...state,
        settlements: {
          ...state.settlements,
          [action.invoiceId]: {
            ...settlement,
            buyerPayment: "received",
          },
        },
      }
    }
    case "SETTLEMENT_PROCESSING": {
      const settlement = state.settlements[action.invoiceId]
      if (!settlement || settlement.buyerPayment !== "received") return state
      return {
        ...state,
        settlements: {
          ...state.settlements,
          [action.invoiceId]: { ...settlement, investorSettlement: "processing" },
        },
      }
    }
    case "SETTLEMENT_COMPLETE": {
      const settlement = state.settlements[action.invoiceId]
      if (!settlement) return state
      return {
        ...state,
        invoices: state.invoices.map((item) =>
          item.id === action.invoiceId ? { ...item, status: "repaid" as const } : item,
        ),
        settlements: {
          ...state.settlements,
          [action.invoiceId]: { ...settlement, investorSettlement: "settled" },
        },
      }
    }
    case "CREATE_BUCKET": {
      if (!state.investor) return state
      const bucket = applyDraft(action.draft, {
        id: `bucket-${Date.now()}`,
        investorId: state.investor.id,
        currentExposure: 0,
        status: "active",
      })
      return {
        ...state,
        buckets: [bucket, ...state.buckets],
        investorTransactions: prependTransaction(state.investorTransactions, {
          at: "Just now",
          kind: "bucket_changed",
          amount: 0,
          note: `Activated ${bucket.name}`,
        }),
      }
    }
    case "UPDATE_BUCKET": {
      const existing = state.buckets.find((bucket) => bucket.id === action.id)
      if (!existing) return state
      return {
        ...state,
        buckets: state.buckets.map((bucket) =>
          bucket.id === action.id
            ? applyDraft(action.draft, {
                id: bucket.id,
                investorId: bucket.investorId,
                currentExposure: bucket.currentExposure,
                status: bucket.status,
              })
            : bucket,
        ),
        investorTransactions: prependTransaction(state.investorTransactions, {
          at: "Just now",
          kind: "bucket_changed",
          amount: 0,
          note: `Updated ${action.draft.name.trim() || existing.name}`,
        }),
      }
    }
    case "SET_BUCKET_STATUS": {
      const existing = state.buckets.find((bucket) => bucket.id === action.id)
      if (!existing || existing.status === action.status) return state
      return {
        ...state,
        buckets: state.buckets.map((bucket) =>
          bucket.id === action.id ? { ...bucket, status: action.status } : bucket,
        ),
        investorTransactions: prependTransaction(state.investorTransactions, {
          at: "Just now",
          kind: "bucket_changed",
          amount: 0,
          note:
            action.status === "paused"
              ? `Paused ${existing.name}`
              : `Reactivated ${existing.name}`,
        }),
      }
    }
    case "DELETE_BUCKET": {
      const existing = state.buckets.find((bucket) => bucket.id === action.id)
      if (!existing) return state
      return {
        ...state,
        buckets: state.buckets.filter((bucket) => bucket.id !== action.id),
        investorTransactions: prependTransaction(state.investorTransactions, {
          at: "Just now",
          kind: "bucket_changed",
          amount: 0,
          note: `Deleted ${existing.name}`,
        }),
      }
    }
    case "DEPOSIT": {
      if (!state.investor || !state.wallet.connected) return state
      const amount = Number.isFinite(action.amount) ? action.amount : 0
      if (amount <= 0 || amount > state.wallet.balance) return state
      return {
        ...state,
        investor: {
          ...state.investor,
          committedCapital: state.investor.committedCapital + amount,
        },
        wallet: { ...state.wallet, balance: state.wallet.balance - amount },
        investorTransactions: prependTransaction(state.investorTransactions, {
          at: "Just now",
          kind: "capital_deposited",
          amount,
          note: "RLUSD deposited from XRPL wallet",
        }),
      }
    }
    case "WITHDRAW": {
      if (!state.investor || !state.wallet.connected) return state
      const amount = Number.isFinite(action.amount) ? action.amount : 0
      const available = calcAvailable(state.investor)
      if (amount <= 0 || amount > available) return state
      return {
        ...state,
        investor: {
          ...state.investor,
          committedCapital: state.investor.committedCapital - amount,
        },
        wallet: { ...state.wallet, balance: state.wallet.balance + amount },
        investorTransactions: prependTransaction(state.investorTransactions, {
          at: "Just now",
          kind: "capital_withdrawn",
          amount: -amount,
          note: "RLUSD withdrawn to XRPL wallet",
        }),
      }
    }
    default:
      return state
  }
}

const emptySellerSlice = {
  profile: null as SellerProfileId | null,
  seller: null as Seller | null,
  invoices: [] as Invoice[],
  riskScores: {} as Record<string, RiskScore>,
  offers: {} as Record<string, Offer>,
  settlements: {} as Record<string, Settlement>,
  soldThisMonthBase: 0,
  averageFinancingCost: 0,
  connections: emptyConnections,
}

const emptyInvestorSlice = {
  investorProfile: null as InvestorProfileId | null,
  investor: null as Investor | null,
  kybStatus: "pending" as KybStatus,
  wallet: { ...EMPTY_WALLET },
  positions: [] as InvestorPosition[],
  buckets: [] as InvestmentBucket[],
  holdings: [] as PortfolioHolding[],
  investorTransactions: [] as InvestorTransaction[],
}

const initialState: State = {
  role: null,
  ...emptySellerSlice,
  ...emptyInvestorSlice,
}

type StoreValue = State & {
  availableToFinance: number
  offersAvailable: number
  soldThisMonth: number
  activeInvoices: Invoice[]
  soldInvoices: Invoice[]
  capitalDeployed: number
  expectedReturn: number
  activePositionCount: number
  availableCapital: number
  activeBucketCount: number
  weightedApr: number
  getInvoice: (id: string) => Invoice | undefined
  getOffer: (id: string) => Offer | undefined
  getRiskScore: (id: string) => RiskScore | undefined
  getSettlement: (id: string) => Settlement | undefined
  getBucket: (id: string) => InvestmentBucket | undefined
  availableThroughBucket: (bucket: InvestmentBucket) => number
  addInvoice: (invoice: Invoice, riskScore?: RiskScore) => void
  selectProfile: (profile: SellerProfileId) => void
  selectInvestorProfile: (profile: InvestorProfileId) => void
  clearProfile: () => void
  completeOnboarding: (seller: Seller) => void
  completeInvestorOnboarding: (investor: Investor, wallet: Wallet) => void
  sellInvoice: (invoiceId: string) => void
  simulateBuyerRepayment: (invoiceId: string) => void
  startInvestorSettlement: (invoiceId: string) => void
  completeSettlement: (invoiceId: string) => void
  createBucket: (draft: BucketDraft) => void
  updateBucket: (id: string, draft: BucketDraft) => void
  setBucketStatus: (id: string, status: BucketStatus) => void
  deleteBucket: (id: string) => void
  deposit: (amount: number) => void
  withdraw: (amount: number) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const addInvoice = useCallback((invoice: Invoice, riskScore?: RiskScore) => {
    dispatch({ type: "ADD_INVOICE", invoice, riskScore })
  }, [])

  const selectProfile = useCallback((profile: SellerProfileId) => {
    dispatch({ type: "SELECT_PROFILE", profile })
  }, [])

  const selectInvestorProfile = useCallback((profile: InvestorProfileId) => {
    dispatch({ type: "SELECT_INVESTOR_PROFILE", profile })
  }, [])

  const clearProfile = useCallback(() => {
    dispatch({ type: "CLEAR_PROFILE" })
  }, [])

  const completeOnboarding = useCallback((seller: Seller) => {
    dispatch({ type: "COMPLETE_ONBOARDING", seller })
  }, [])

  const completeInvestorOnboarding = useCallback((investor: Investor, wallet: Wallet) => {
    dispatch({ type: "COMPLETE_INVESTOR_ONBOARDING", investor, wallet })
  }, [])

  const sellInvoice = useCallback((invoiceId: string) => {
    dispatch({ type: "SELL_INVOICE", invoiceId })
  }, [])

  const simulateBuyerRepayment = useCallback((invoiceId: string) => {
    dispatch({ type: "BUYER_REPAID", invoiceId })
  }, [])

  const startInvestorSettlement = useCallback((invoiceId: string) => {
    dispatch({ type: "SETTLEMENT_PROCESSING", invoiceId })
  }, [])

  const completeSettlement = useCallback((invoiceId: string) => {
    dispatch({ type: "SETTLEMENT_COMPLETE", invoiceId })
  }, [])

  const createBucket = useCallback((draft: BucketDraft) => {
    dispatch({ type: "CREATE_BUCKET", draft })
  }, [])

  const updateBucket = useCallback((id: string, draft: BucketDraft) => {
    dispatch({ type: "UPDATE_BUCKET", id, draft })
  }, [])

  const setBucketStatus = useCallback((id: string, status: BucketStatus) => {
    dispatch({ type: "SET_BUCKET_STATUS", id, status })
  }, [])

  const deleteBucket = useCallback((id: string) => {
    dispatch({ type: "DELETE_BUCKET", id })
  }, [])

  const deposit = useCallback((amount: number) => {
    dispatch({ type: "DEPOSIT", amount })
  }, [])

  const withdraw = useCallback((amount: number) => {
    dispatch({ type: "WITHDRAW", amount })
  }, [])

  const value = useMemo<StoreValue>(() => {
    const activeInvoices = state.invoices.filter(
      (invoice) => invoice.status !== "sold" && invoice.status !== "repaid",
    )
    const soldInvoices = state.invoices.filter(
      (invoice) => invoice.status === "sold" || invoice.status === "repaid",
    )
    const financeable = activeInvoices.filter(
      (invoice) => invoice.status === "eligible" || invoice.status === "offer_available",
    )
    const soldProceeds = soldInvoices.reduce((sum, invoice) => {
      const settlement = state.settlements[invoice.id]
      return sum + (settlement?.sellerReceived ?? invoice.finalOffer ?? 0)
    }, 0)

    const capitalDeployed = state.investor?.deployedCapital ?? 0
    const openHoldings = state.holdings.filter((holding) => holding.status !== "Settled")
    const invested = openHoldings.reduce((sum, holding) => sum + holding.amountInvested, 0)
    const expectedReturn =
      invested > 0
        ? openHoldings.reduce((sum, holding) => sum + holding.apr * holding.amountInvested, 0) /
          invested
        : 0
    const activePositionCount = state.holdings.filter(
      (holding) => holding.status === "Current",
    ).length
    const available = state.investor ? calcAvailable(state.investor) : 0

    return {
      ...state,
      activeInvoices,
      soldInvoices,
      availableToFinance: financeable.reduce((sum, invoice) => sum + invoice.faceValue, 0),
      offersAvailable: financeable.length,
      soldThisMonth: state.soldThisMonthBase + soldProceeds,
      capitalDeployed,
      expectedReturn,
      activePositionCount,
      availableCapital: available,
      activeBucketCount: state.buckets.filter((bucket) => bucket.status === "active").length,
      weightedApr: expectedReturn,
      getInvoice: (id) => state.invoices.find((invoice) => invoice.id === id),
      getOffer: (id) => state.offers[id],
      getRiskScore: (id) => state.riskScores[id],
      getSettlement: (id) => state.settlements[id],
      getBucket: (id) => state.buckets.find((bucket) => bucket.id === id),
      availableThroughBucket: (bucket) =>
        state.investor ? calcThroughBucket(state.investor, bucket) : 0,
      addInvoice,
      selectProfile,
      selectInvestorProfile,
      clearProfile,
      completeOnboarding,
      completeInvestorOnboarding,
      sellInvoice,
      simulateBuyerRepayment,
      startInvestorSettlement,
      completeSettlement,
      createBucket,
      updateBucket,
      setBucketStatus,
      deleteBucket,
      deposit,
      withdraw,
    }
  }, [
    state,
    addInvoice,
    selectProfile,
    selectInvestorProfile,
    clearProfile,
    completeOnboarding,
    completeInvestorOnboarding,
    sellInvoice,
    simulateBuyerRepayment,
    startInvestorSettlement,
    completeSettlement,
    createBucket,
    updateBucket,
    setBucketStatus,
    deleteBucket,
    deposit,
    withdraw,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error("useStore must be used within MockStoreProvider")
  }
  return context
}
