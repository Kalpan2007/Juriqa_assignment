"""Content for the long fixture: a fictional DIFC-law Term Facility Agreement.

Every party, person and address here is invented. Facts that the test guide asks about are
written once, in hand-written clauses, so answers are unambiguous. Padding paragraphs only
elaborate procedure and never restate those facts.
"""
import random

PARTIES = {
    "borrower": "Al Noor Trading L.L.C.",
    "guarantor": "Al Noor Holdings Limited",
    "lender": "Gulf Meridian Bank P.J.S.C.",
}

# Sentence repeated on purpose in three places (multiple-occurrence highlight test).
REPEATED = ("The Borrower shall promptly notify the Lender of any Default (and the steps, if any, "
            "being taken to remedy it) upon becoming aware of its occurrence.")

DEFINITIONS = [
    ("Account Bank", "Gulf Meridian Bank P.J.S.C. acting through its branch at Gate Precinct Building 4, Dubai International Financial Centre, or any replacement bank approved by the Lender."),
    ("Accounting Principles", "International Financial Reporting Standards as adopted and applied consistently by the Borrower in preparing its Original Financial Statements."),
    ("Affiliate", "in relation to any person, a Subsidiary of that person or a Holding Company of that person or any other Subsidiary of that Holding Company."),
    ("Anti-Corruption Laws", "all laws, rules and regulations of any jurisdiction applicable to the Borrower or any Obligor from time to time concerning or relating to bribery, corruption or money laundering, including UAE Federal Decree-Law No. 20 of 2018."),
    ("Arrangement Fee", "the fee of AED 1,875,000 (one million eight hundred and seventy-five thousand UAE dirhams) payable by the Borrower to the Lender under Clause 11.2 (Arrangement fee)."),
    ("Authorisation", "an authorisation, consent, approval, resolution, licence, exemption, filing, notarisation, lodgement or registration."),
    ("Availability Period", "the period from and including the date of this Agreement to and including the date falling nine (9) Months after the date of this Agreement."),
    ("Available Commitment", "the Commitment minus the aggregate amount of the outstanding Loans and, in relation to any proposed Utilisation, the amount of any Loans that are due to be made on or before the proposed Utilisation Date."),
    ("Break Costs", "the amount (if any) by which the interest which the Lender should have received for the period from the date of receipt of all or any part of a Loan to the last day of the current Interest Period exceeds the amount which the Lender would be able to obtain by placing an equal amount on deposit with a leading bank in the UAE interbank market."),
    ("Business Day", "a day (other than a Saturday or Sunday) on which banks are open for general business in Dubai."),
    ("Change of Control", "Mr. Khalid Rashed Al Noor (or his estate) ceasing to own, directly or indirectly, at least 51 per cent. of the issued share capital of the Guarantor."),
    ("Commitment", "AED 250,000,000 (two hundred and fifty million UAE dirhams), to the extent not cancelled, reduced or transferred under this Agreement."),
    ("Compliance Certificate", "a certificate substantially in the form set out in Schedule 6 (Form of Compliance Certificate)."),
    ("Default", "an Event of Default or any event or circumstance specified in Clause 23 (Events of Default) which would (with the expiry of a grace period, the giving of notice, the making of any determination under the Finance Documents or any combination of any of the foregoing) be an Event of Default."),
    ("DIAC Rules", "the Arbitration Rules of the Dubai International Arbitration Centre in force at the date on which the request for arbitration is submitted."),
    ("DIFC", "the Dubai International Financial Centre."),
    ("EIBOR", "in relation to any Loan, the Emirates Interbank Offered Rate administered by the Central Bank of the UAE for dirhams for the relevant period, displayed on the relevant screen page at or about 11.00 a.m. Dubai time on the Quotation Day."),
    ("Event of Default", "any event or circumstance specified as such in Clause 23 (Events of Default)."),
    ("Final Repayment Date", "the date falling sixty (60) Months after the first Utilisation Date."),
    ("Finance Document", "this Agreement, the Guarantee, any Security Document, any Fee Letter, any Utilisation Request and any other document designated as such by the Lender and the Borrower."),
    ("Financial Indebtedness", "any indebtedness for or in respect of moneys borrowed, any amount raised by acceptance under any acceptance credit facility, any amount raised under any note purchase facility or the issue of bonds, notes, debentures, loan stock or any similar instrument, and the amount of any liability in respect of any lease or hire purchase contract which would, in accordance with the Accounting Principles, be treated as a balance sheet liability."),
    ("Group", "the Guarantor and each of its Subsidiaries for the time being."),
    ("Guarantee", "the guarantee and indemnity granted by the Guarantor in favour of the Lender under Clause 18 (Guarantee and indemnity)."),
    ("Holding Company", "in relation to a person, any other person in respect of which it is a Subsidiary."),
    ("Interest Period", "in relation to a Loan, each period determined in accordance with Clause 9 (Interest Periods)."),
    ("Leverage", "in respect of any Relevant Period, the ratio of Total Net Debt on the last day of that Relevant Period to EBITDA in respect of that Relevant Period."),
    ("Loan", "a loan made or to be made under the Facility or the principal amount outstanding for the time being of that loan."),
    ("Margin", "2.75 per cent. per annum."),
    ("Material Adverse Effect", "a material adverse effect on (a) the business, operations, property or financial condition of the Group taken as a whole; (b) the ability of an Obligor to perform its payment obligations under the Finance Documents; or (c) the validity or enforceability of any Finance Document."),
    ("Month", "a period starting on one day in a calendar month and ending on the numerically corresponding day in the next calendar month."),
    ("Obligor", "the Borrower or the Guarantor."),
    ("Original Financial Statements", "the audited consolidated financial statements of the Group for the financial year ended 31 December 2025."),
    ("Permitted Security", "any Security listed in Schedule 9 (Existing Security), any lien arising by operation of law in the ordinary course of trading, and any Security approved in writing by the Lender."),
    ("Quotation Day", "in relation to any period for which an interest rate is to be determined, two (2) Business Days before the first day of that period."),
    ("Relevant Period", "each period of twelve (12) Months ending on or about the last day of the financial year and each period of twelve (12) Months ending on or about the last day of each financial half-year."),
    ("Repayment Date", "each of 31 March, 30 June, 30 September and 31 December in each year, the first falling after the first anniversary of the first Utilisation Date."),
    ("Sanctions", "any economic or financial sanctions laws, regulations, embargoes or restrictive measures administered, enacted or enforced by the United Nations Security Council, the UAE, the United States of America, the European Union or the United Kingdom."),
    ("Security", "a mortgage, charge, pledge, lien, assignment by way of security or other security interest securing any obligation of any person, or any other agreement or arrangement having a similar effect."),
    ("Subsidiary", "an entity of which a person has direct or indirect control or owns directly or indirectly more than 50 per cent. of the voting capital or similar right of ownership."),
    ("Tax", "any tax, levy, impost, duty or other charge or withholding of a similar nature, including value added tax and corporate tax under UAE Federal Decree-Law No. 47 of 2022, and any penalty or interest payable in connection with any failure to pay or any delay in paying any of the same."),
    ("Termination Date", "the Final Repayment Date."),
    ("Total Net Debt", "at any time, the aggregate amount of all obligations of members of the Group for or in respect of Financial Indebtedness at that time, less the aggregate amount of cash and cash equivalent investments held by any member of the Group at that time."),
    ("Utilisation", "a utilisation of the Facility."),
    ("Utilisation Date", "the date of a Utilisation, being the date on which the relevant Loan is to be made."),
    ("Utilisation Request", "a notice substantially in the form set out in Schedule 3 (Form of Utilisation Request)."),
]

# (title, [hand-written paragraphs]). Padding is added by the builder.
CLAUSES = [
    ("Definitions and Interpretation", None),  # built from DEFINITIONS
    ("The Facility", [
        "Subject to the terms of this Agreement, the Lender makes available to the Borrower a dirham term loan facility in an aggregate amount equal to the Commitment.",
        "The Facility is a single-tranche amortising facility and no amount repaid or prepaid may be re-borrowed.",
        "The obligations of the Lender under the Finance Documents are several and the Lender is not responsible for the obligations of any other person.",
    ]),
    ("Purpose", [
        "The Borrower shall apply all amounts borrowed by it under the Facility towards (a) the refinancing of the existing working capital facility made available to the Borrower by Coastal Finance P.S.C., (b) the acquisition of warehousing equipment for its logistics site in Jebel Ali Free Zone, and (c) the general corporate purposes of the Group.",
        "The Lender is not bound to monitor or verify the application of any amount borrowed pursuant to this Agreement.",
    ]),
    ("Conditions of Utilisation", [
        "The Borrower may not deliver a Utilisation Request unless the Lender has received all of the documents and other evidence listed in Schedule 2 (Conditions Precedent) in form and substance satisfactory to the Lender.",
        "The Lender will only be obliged to comply with Clause 5.4 (Lender's participation) if on the date of the Utilisation Request and on the proposed Utilisation Date no Default is continuing or would result from the proposed Loan, and the Repeating Representations are true in all material respects.",
        "The Borrower may not deliver more than six (6) Utilisation Requests during the Availability Period.",
    ]),
    ("Utilisation", [
        "The Borrower may utilise the Facility by delivery to the Lender of a duly completed Utilisation Request not later than 11.00 a.m. Dubai time three (3) Business Days before the proposed Utilisation Date.",
        "Each Utilisation Request is irrevocable and will not be regarded as having been duly completed unless the proposed Utilisation Date is a Business Day within the Availability Period and the amount of the proposed Loan is a minimum of AED 10,000,000 or, if less, the Available Commitment.",
        "The currency specified in a Utilisation Request must be UAE dirhams.",
        "If the conditions set out in this Agreement have been met, the Lender shall make each Loan available by the Utilisation Date through its Facility Office (Lender's participation).",
        "The Commitment which, at that time, is unutilised shall be immediately cancelled at the end of the Availability Period.",
    ]),
    ("Repayment", [
        "The Borrower shall repay the Loans in twenty (20) equal consecutive quarterly instalments on each Repayment Date, the amount of each instalment being as set out in Schedule 8 (Repayment Schedule).",
        "The Borrower shall repay all outstanding Loans, together with accrued interest and all other amounts accrued under the Finance Documents, in full on the Final Repayment Date.",
        "The Borrower may not re-borrow any part of the Facility which is repaid.",
    ]),
    ("Illegality, Prepayment and Cancellation", [
        "If it becomes unlawful in any applicable jurisdiction for the Lender to perform any of its obligations as contemplated by this Agreement or to fund or maintain any Loan, the Lender shall promptly notify the Borrower, the Available Commitment will be immediately cancelled and the Borrower shall repay the Loans on the last day of the Interest Period for each Loan occurring after the Lender has notified the Borrower.",
        "If a Change of Control occurs, the Borrower shall promptly notify the Lender upon becoming aware of that event, and the Lender may, by not less than ten (10) Business Days' notice to the Borrower, cancel the Facility and declare all outstanding Loans immediately due and payable.",
        "The Borrower may, if it gives the Lender not less than fifteen (15) Business Days' prior notice, prepay the whole or any part of any Loan (but, if in part, by a minimum amount of AED 5,000,000).",
        "Any voluntary prepayment made before the second anniversary of the first Utilisation Date shall be subject to a prepayment fee of 1.00 per cent. of the amount prepaid; no prepayment fee is payable for prepayments made on or after that date.",
        "Any prepayment under this Agreement shall be made together with accrued interest on the amount prepaid and, subject to any Break Costs, without premium or penalty except as stated above.",
    ]),
    ("Interest", [
        "The rate of interest on each Loan for each Interest Period is the percentage rate per annum which is the aggregate of the applicable Margin and EIBOR.",
        "If EIBOR is less than zero, EIBOR shall be deemed to be zero.",
        "The Borrower shall pay accrued interest on each Loan on the last day of each Interest Period.",
        "If an Obligor fails to pay any amount payable by it under a Finance Document on its due date, interest shall accrue on the overdue amount from the due date up to the date of actual payment at a rate which is 2.00 per cent. per annum higher than the rate which would have been payable if the overdue amount had constituted a Loan in the currency of the overdue amount for successive Interest Periods (default interest).",
        "The Lender shall promptly notify the Borrower of the determination of a rate of interest under this Agreement.",
    ]),
    ("Interest Periods", [
        "Each Interest Period for a Loan shall be three (3) Months or any other period agreed between the Borrower and the Lender.",
        "An Interest Period for a Loan shall not extend beyond the Final Repayment Date.",
        "If an Interest Period would otherwise end on a day which is not a Business Day, that Interest Period will instead end on the next Business Day in that calendar month (if there is one) or the preceding Business Day (if there is not).",
    ]),
    ("Changes to the Calculation of Interest", [
        "If EIBOR is not available for the relevant Interest Period, the rate of interest for that Interest Period shall be the rate notified to the Borrower by the Lender as soon as practicable as being its cost of funding the relevant Loan from whatever source it may reasonably select.",
        "If a market disruption event occurs and the Lender or the Borrower so requires, the Lender and the Borrower shall enter into negotiations for a period of not more than thirty (30) days with a view to agreeing a substitute basis for determining the rate of interest.",
        "The Borrower shall, within three (3) Business Days of a demand by the Lender, pay to the Lender its Break Costs attributable to all or any part of a Loan being paid by the Borrower on a day other than the last day of an Interest Period for that Loan.",
    ]),
    ("Fees", [
        "The Borrower shall pay to the Lender a commitment fee computed at the rate of 35 per cent. of the applicable Margin on the Available Commitment for the Availability Period, payable quarterly in arrears.",
        "The Borrower shall pay to the Lender the Arrangement Fee on the earlier of the date of this Agreement and the first Utilisation Date.",
        "The Borrower shall pay to the Lender an annual monitoring fee of AED 150,000, payable in advance on the date of this Agreement and on each anniversary of it.",
    ]),
    ("Tax Gross Up and Indemnities", [
        "Each Obligor shall make all payments to be made by it without any Tax Deduction, unless a Tax Deduction is required by law.",
        "If a Tax Deduction is required by law to be made by an Obligor, the amount of the payment due from that Obligor shall be increased to an amount which (after making any Tax Deduction) leaves an amount equal to the payment which would have been due if no Tax Deduction had been required.",
        "All amounts expressed to be payable under a Finance Document by any party to the Lender which constitute the consideration for any supply for value added tax purposes are deemed to be exclusive of any value added tax which is chargeable on that supply.",
    ]),
    ("Increased Costs", [
        "The Borrower shall, within five (5) Business Days of a demand by the Lender, pay for the account of the Lender the amount of any increased costs incurred by the Lender as a result of the introduction of or any change in any law or regulation after the date of this Agreement.",
        "The Lender shall notify the Borrower of the event giving rise to the claim and provide a certificate confirming the amount of its increased costs.",
    ]),
    ("Other Indemnities", [
        "Each Obligor shall, within three (3) Business Days of demand, indemnify the Lender against any cost, loss or liability incurred by it as a result of the occurrence of any Event of Default, a failure by an Obligor to pay any amount due under a Finance Document on its due date, or funding a Loan requested by the Borrower in a Utilisation Request but not made by reason of the operation of any provision of this Agreement.",
        "If any sum due from an Obligor under the Finance Documents has to be converted from the currency in which that sum is payable into another currency, that Obligor shall indemnify the Lender against any cost, loss or liability arising out of or as a result of the conversion.",
    ]),
    ("Mitigation by the Lender", [
        "The Lender shall, in consultation with the Borrower, take all reasonable steps to mitigate any circumstances which arise and which would result in any amount becoming payable under Clause 7.1 (Illegality), Clause 12 (Tax Gross Up and Indemnities) or Clause 13 (Increased Costs).",
        "The Lender is not obliged to take any steps under this Clause 15 if, in its opinion (acting reasonably), to do so might be prejudicial to it.",
    ]),
    ("Costs and Expenses", [
        "The Borrower shall promptly on demand pay the Lender the amount of all costs and expenses (including legal fees, subject to an agreed cap of AED 400,000) reasonably incurred by it in connection with the negotiation, preparation, printing and execution of this Agreement and any other Finance Documents executed on or about the date of this Agreement.",
        "The Borrower shall, within three (3) Business Days of demand, pay to the Lender the amount of all costs and expenses (including legal fees) incurred by the Lender in connection with the enforcement of, or the preservation of any rights under, any Finance Document.",
    ]),
    ("Security", [
        "The obligations of the Borrower under the Finance Documents shall be secured by a first-ranking mortgage over the Borrower's warehouse at Plot S-20417, Jebel Ali Free Zone, an assignment of the Borrower's receivables under its contracts with its five largest customers, and a pledge over the Borrower's collection account held with the Account Bank.",
        "The Borrower shall procure that the value of the mortgaged property is at all times not less than 150 per cent. of the aggregate outstanding Loans, as determined by an independent valuer approved by the Lender at least once in each financial year.",
    ]),
    ("Guarantee and Indemnity", [
        "The Guarantor irrevocably and unconditionally guarantees to the Lender punctual performance by the Borrower of all of the Borrower's obligations under the Finance Documents.",
        "The Guarantor undertakes with the Lender that whenever the Borrower does not pay any amount when due under or in connection with any Finance Document, the Guarantor shall immediately on demand pay that amount as if it was the principal obligor.",
        "This guarantee is a continuing guarantee and will extend to the ultimate balance of sums payable by any Obligor under the Finance Documents, regardless of any intermediate payment or discharge in whole or in part.",
        "The maximum aggregate liability of the Guarantor under this Clause 18 shall not exceed AED 300,000,000 (three hundred million UAE dirhams) together with interest, costs and expenses.",
    ]),
    ("Representations", [
        "Each Obligor makes the representations and warranties set out in this Clause 19 to the Lender on the date of this Agreement.",
        "It is a limited liability company or a company limited by shares, duly incorporated and validly existing under the law of its jurisdiction of incorporation, and it has the power to own its assets and carry on its business as it is being conducted.",
        "The obligations expressed to be assumed by it in each Finance Document are, subject to any general principles of law limiting obligations, legal, valid, binding and enforceable obligations.",
        "No litigation, arbitration or administrative proceedings of or before any court, arbitral body or agency which, if adversely determined, might reasonably be expected to have a Material Adverse Effect have been started or threatened against it or any of its Subsidiaries.",
        "Neither it nor any of its Subsidiaries, nor to its knowledge any director, officer or employee of any of them, is a person that is the target of Sanctions.",
        "The Repeating Representations are deemed to be made by each Obligor by reference to the facts and circumstances then existing on the date of each Utilisation Request, on each Utilisation Date and on the first day of each Interest Period.",
    ]),
    ("Information Undertakings", [
        "The Borrower shall supply to the Lender as soon as they are available, but in any event within one hundred and twenty (120) days after the end of each of its financial years, the audited consolidated financial statements of the Group for that financial year.",
        "The Borrower shall supply to the Lender as soon as they are available, but in any event within sixty (60) days after the end of each half of each of its financial years, the unaudited consolidated financial statements of the Group for that financial half-year.",
        "With each set of financial statements delivered under this Clause 20, the Borrower shall supply to the Lender a Compliance Certificate setting out (in reasonable detail) computations as to compliance with Clause 21 (Financial Covenants), signed by the chief financial officer of the Guarantor.",
        "The Borrower shall supply to the Lender promptly upon becoming aware of them, the details of any litigation, arbitration or administrative proceedings which are current, threatened or pending against any member of the Group and which, if adversely determined, are reasonably likely to have a Material Adverse Effect.",
        REPEATED,
        "The Borrower shall promptly upon the request of the Lender supply, or procure the supply of, such documentation and other evidence as is reasonably requested by the Lender in order for it to carry out and be satisfied with the results of all necessary “know your customer” or other similar checks under all applicable laws and regulations.",
    ]),
    ("Financial Covenants", [
        "The Guarantor shall ensure that Leverage in respect of any Relevant Period shall not exceed 3.50:1.",
        "The Guarantor shall ensure that the ratio of EBITDA to Net Finance Charges (Interest Cover) in respect of any Relevant Period shall not be less than 4.00:1.",
        "The Guarantor shall ensure that Tangible Net Worth of the Group shall at all times be not less than AED 400,000,000 (four hundred million UAE dirhams).",
        "The financial covenants set out in this Clause 21 shall be calculated in accordance with the Accounting Principles and tested by reference to each of the financial statements and each Compliance Certificate delivered under Clause 20 (Information Undertakings).",
    ]),
    ("General Undertakings", [
        "Each Obligor shall promptly obtain, comply with and do all that is necessary to maintain in full force and effect any Authorisation required under any law or regulation of its jurisdiction of incorporation to enable it to perform its obligations under the Finance Documents.",
        "No Obligor shall (and the Guarantor shall ensure that no other member of the Group will) create or permit to subsist any Security over any of its assets, other than Permitted Security.",
        "No Obligor shall enter into a single transaction or a series of transactions (whether related or not) to sell, lease, transfer or otherwise dispose of any asset, other than disposals made in the ordinary course of trading or disposals of obsolete assets with an aggregate value not exceeding AED 15,000,000 in any financial year.",
        "No Obligor shall enter into any amalgamation, demerger, merger or corporate reconstruction without the prior written consent of the Lender.",
        "The Borrower shall procure that no substantial change is made to the general nature of the business of the Borrower or the Group from that carried on at the date of this Agreement.",
        "The Borrower shall not declare, make or pay any dividend, charge, fee or other distribution while a Default is continuing or would result from that payment.",
        "Each Obligor shall maintain insurances on and in relation to its business and assets with reputable underwriters or insurance companies against those risks and to the extent as is usual for companies carrying on the same or substantially similar business, and the Lender shall be named as first loss payee on the property insurance for the mortgaged warehouse.",
        "Each Obligor shall comply in all respects with all laws to which it may be subject, if failure so to comply would materially impair its ability to perform its obligations under the Finance Documents, and shall conduct its businesses in compliance with applicable Anti-Corruption Laws.",
        "Each Obligor shall maintain its books and records in English and in accordance with the Accounting Principles, and shall permit the Lender, on reasonable notice and not more than once in each financial year while no Default is continuing, to inspect them.",
        REPEATED,
    ]),
    ("Events of Default", [
        "Each of the events or circumstances set out in this Clause 23 is an Event of Default.",
        "Non-payment: an Obligor does not pay on the due date any amount payable pursuant to a Finance Document at the place and in the currency in which it is expressed to be payable, unless its failure to pay is caused by administrative or technical error and payment is made within three (3) Business Days of its due date.",
        "Financial covenants: any requirement of Clause 21 (Financial Covenants) is not satisfied.",
        "Other obligations: an Obligor does not comply with any provision of the Finance Documents (other than those referred to above) and the failure to comply is not remedied within twenty-one (21) days of the earlier of the Lender giving notice to the Borrower and the Borrower becoming aware of the failure to comply.",
        "Misrepresentation: any representation or statement made or deemed to be made by an Obligor in the Finance Documents is or proves to have been incorrect or misleading in any material respect when made or deemed to be made.",
        "Cross default: any Financial Indebtedness of any member of the Group is not paid when due nor within any originally applicable grace period, or is declared to be due and payable prior to its specified maturity as a result of an event of default (however described); no Event of Default will occur under this paragraph if the aggregate amount of Financial Indebtedness falling within it is less than AED 10,000,000 (ten million UAE dirhams) or its equivalent in any other currency.",
        "Insolvency: a member of the Group is unable or admits inability to pay its debts as they fall due, suspends making payments on any of its debts or, by reason of actual or anticipated financial difficulties, commences negotiations with one or more of its creditors with a view to rescheduling any of its indebtedness.",
        "Insolvency proceedings: any corporate action, legal proceedings or other procedure or step is taken in relation to the suspension of payments, a moratorium of any indebtedness, winding-up, dissolution, administration or reorganisation of any member of the Group under UAE Federal Decree-Law No. 51 of 2023 or the DIFC Insolvency Law.",
        "Cessation of business: any Obligor suspends or ceases to carry on all or a material part of its business.",
        "Material adverse change: any event or circumstance occurs which the Lender reasonably believes has or is reasonably likely to have a Material Adverse Effect.",
        "Acceleration: on and at any time after the occurrence of an Event of Default which is continuing the Lender may by notice to the Borrower cancel the Commitment, declare that all or part of the Loans, together with accrued interest and all other amounts accrued under the Finance Documents, be immediately due and payable, and exercise any or all of its rights, remedies, powers or discretions under the Finance Documents.",
    ]),
    ("Changes to the Lender", [
        "The Lender may assign any of its rights or transfer by novation any of its rights and obligations to another bank or financial institution, provided that the consent of the Borrower (not to be unreasonably withheld or delayed, and deemed given if not refused within ten (10) Business Days) is required unless an Event of Default is continuing or the transfer is to an Affiliate of the Lender.",
        "The Lender may disclose to any actual or potential assignee or transferee such information about any Obligor and the Finance Documents as the Lender considers appropriate, provided that the recipient has entered into a confidentiality undertaking.",
    ]),
    ("Changes to the Obligors", [
        "No Obligor may assign any of its rights or transfer any of its rights or obligations under the Finance Documents.",
    ]),
    ("Conduct of Business by the Lender", [
        "No provision of this Agreement will interfere with the right of the Lender to arrange its affairs (tax or otherwise) in whatever manner it thinks fit, or oblige the Lender to disclose any information relating to its affairs (tax or otherwise) or any computations in respect of Tax.",
    ]),
    ("Payment Mechanics", [
        "On each date on which an Obligor is required to make a payment under a Finance Document, that Obligor shall make the same available to the Lender for value on the due date at the time and in such funds specified by the Lender as being customary at the time for settlement of transactions in UAE dirhams.",
        "All payments to be made by an Obligor under the Finance Documents shall be calculated and be made without (and free and clear of any deduction for) set-off or counterclaim.",
        "Any interest, commission or fee accruing under a Finance Document will accrue from day to day and is calculated on the basis of the actual number of days elapsed and a year of 360 days.",
    ]),
    ("Set-Off", [
        "The Lender may set off any matured obligation due from an Obligor under the Finance Documents against any matured obligation owed by the Lender to that Obligor, regardless of the place of payment, booking branch or currency of either obligation.",
    ]),
    ("Notices", [
        "Any communication to be made under or in connection with the Finance Documents shall be made in writing and, unless otherwise stated, may be made by email or letter.",
        "The address and email address of the Borrower for any communication is: Al Noor Trading L.L.C., Office 1407, Al Saqr Business Tower, Sheikh Zayed Road, Dubai, United Arab Emirates; email: treasury@alnoor-trading.example; for the attention of: Chief Financial Officer.",
        "The address and email address of the Lender for any communication is: Gulf Meridian Bank P.J.S.C., Corporate Banking Division, Level 9, Gate Precinct Building 4, DIFC, Dubai, United Arab Emirates; email: corporate.agency@gulfmeridian.example; for the attention of: Head of Loan Administration.",
        "Any communication made by email will be effective only when actually received in readable form and, if received after 5.00 p.m. Dubai time, shall be deemed received on the next Business Day.",
    ]),
    ("Calculations and Certificates", [
        "In any litigation or arbitration proceedings arising out of or in connection with a Finance Document, the entries made in the accounts maintained by the Lender are prima facie evidence of the matters to which they relate.",
        "Any certification or determination by the Lender of a rate or amount under any Finance Document is, in the absence of manifest error, conclusive evidence of the matters to which it relates.",
    ]),
    ("Partial Invalidity", [
        "If, at any time, any provision of a Finance Document is or becomes illegal, invalid or unenforceable in any respect under any law of any jurisdiction, neither the legality, validity or enforceability of the remaining provisions nor the legality, validity or enforceability of such provision under the law of any other jurisdiction will in any way be affected or impaired.",
    ]),
    ("Remedies and Waivers", [
        "No failure to exercise, nor any delay in exercising, on the part of the Lender, any right or remedy under a Finance Document shall operate as a waiver of any such right or remedy or constitute an election to affirm any of the Finance Documents.",
        "The Lender shall not be liable to any Obligor for any loss arising from any action taken or omitted by it under or in connection with any Finance Document, unless directly caused by its gross negligence or wilful misconduct.",
    ]),
    ("Amendments and Waivers", [
        "Any term of the Finance Documents may be amended or waived only with the written consent of the Lender and the Obligors.",
    ]),
    ("Confidentiality", [
        "The Lender agrees to keep all Confidential Information confidential and not to disclose it to anyone, save to the extent permitted by this Clause 34.",
        "The Lender may disclose Confidential Information to any of its Affiliates and its and their officers, directors, employees, professional advisers and auditors, to any person to whom information is required to be disclosed by any court, arbitral tribunal, regulator or the Dubai Financial Services Authority, and with the consent of the Borrower.",
        "The obligations in this Clause 34 shall continue for a period of twelve (12) Months from the earlier of the date on which all amounts payable by the Obligors under the Finance Documents have been paid in full and the date on which the Lender otherwise ceases to be a party to this Agreement.",
    ]),
    ("Sanctions and Anti-Corruption", [
        "No Obligor shall, directly or indirectly, use the proceeds of any Loan, or lend, contribute or otherwise make available such proceeds to any person, to fund any activities of or business with any person that is the target of Sanctions, or in any manner that would result in a violation of Sanctions by any person.",
        "No Obligor shall use the proceeds of any Loan for any purpose which would breach any Anti-Corruption Laws, and each Obligor shall maintain policies and procedures designed to promote and achieve compliance with such laws.",
    ]),
    ("Counterparts", [
        "Each Finance Document may be executed in any number of counterparts, and this has the same effect as if the signatures on the counterparts were on a single copy of the Finance Document. Signature by electronic means in accordance with UAE Federal Decree-Law No. 46 of 2021 shall be valid and binding.",
    ]),
    ("Governing Law", [
        "This Agreement and any non-contractual obligations arising out of or in connection with it are governed by the laws of the Dubai International Financial Centre.",
        "Nothing in this Clause 37 shall prevent the Lender from taking enforcement proceedings in respect of any arbitral award in the courts of the Emirate of Dubai or any other court of competent jurisdiction.",
    ]),
    ("Arbitration", [
        "Any dispute, controversy or claim arising out of or in connection with this Agreement, including any question regarding its existence, validity or termination, shall be referred to and finally resolved by arbitration under the DIAC Rules.",
        "The number of arbitrators shall be three (3). The seat, or legal place, of arbitration shall be the Dubai International Financial Centre. The language to be used in the arbitral proceedings shall be English.",
        "Notwithstanding the above, the Lender may, at its sole option, bring proceedings in the courts of the Dubai International Financial Centre against any Obligor in relation to any dispute, and each Obligor irrevocably submits to the jurisdiction of those courts for that purpose.",
        "Each Obligor irrevocably waives any objection which it may now or hereafter have to the laying of the venue of any proceedings in any such court or arbitration and any claim that any such proceedings have been brought in an inconvenient forum.",
    ]),
]

# Generic but realistic elaboration used to bring the agreement to full length.
PAD_TEMPLATES = [
    "For the purposes of this Clause {n}, any reference to a matter being {adj} shall be construed by reference to the facts and circumstances existing at the relevant time and not with the benefit of hindsight.",
    "The rights of the Lender under this Clause {n} are cumulative and are in addition to, and not in substitution for, any rights it may have under general law or under any other Finance Document.",
    "Any determination required to be made by the Lender under this Clause {n} shall be made in good faith and, where expressed to be reasonable, by reference to the {topic} practice then prevailing among leading banks in the United Arab Emirates.",
    "Where this Clause {n} requires any document to be delivered to the Lender, that document shall be delivered in the English language or, if not in English, accompanied by a certified English translation prepared by a translator licensed by the UAE Ministry of Justice.",
    "Nothing in this Clause {n} shall oblige the Lender to take any action in relation to {topic} which would, in its reasonable opinion, be contrary to any applicable law, regulation or directive of the Central Bank of the UAE.",
    "The Borrower acknowledges that the provisions of this Clause {n} relating to {topic} have been specifically negotiated and that it has had the benefit of independent legal advice in relation to them.",
    "If there is any inconsistency between this Clause {n} and any other provision of the Finance Documents relating to {topic}, this Clause {n} shall prevail to the extent of that inconsistency, save where the other provision expressly states otherwise.",
    "Any notice, request or certificate delivered in connection with this Clause {n} shall be signed by an authorised signatory of the relevant party whose specimen signature has previously been delivered to the Lender under Schedule 2 (Conditions Precedent).",
    "The Lender may, acting reasonably, request such further information in connection with {topic} as it may require from time to time, and the Borrower shall supply that information within ten (10) Business Days of the request.",
    "Each of the obligations of the Obligors in this Clause {n} relating to {topic} shall remain in force from the date of this Agreement for so long as any amount is outstanding under the Finance Documents.",
    "The parties agree that, in the context of {topic}, the expression “promptly” means as soon as reasonably practicable and in any event within five (5) Business Days, unless a shorter period is expressly specified.",
    "Any calculation in connection with {topic} shall be made on the basis of the most recent financial statements delivered to the Lender and, where relevant, shall take account of any pro forma adjustments approved in writing by the Lender.",
    "No waiver given by the Lender in relation to {topic} on any occasion shall operate as a waiver on any other occasion, and any such waiver shall be effective only if given in writing and signed by an authorised signatory of the Lender.",
    "The Borrower shall bear all registration, notarisation and filing fees payable in connection with any step contemplated by this Clause {n} in relation to {topic}, including any fee payable to the Dubai Land Department or the relevant free zone authority.",
    "In relation to {topic}, references in this Clause {n} to the Group shall be construed as including any entity which becomes a member of the Group after the date of this Agreement, from the date on which it becomes a member of the Group.",
    "Without prejudice to the generality of the foregoing, the Lender may agree in writing to extend any period for compliance under this Clause {n} where it is satisfied that the delay in relation to {topic} results from circumstances outside the control of the relevant Obligor.",
    "The Borrower shall procure that its auditors are authorised, at the cost of the Borrower, to discuss matters relating to {topic} directly with the Lender, provided that the Lender shall give the Borrower reasonable notice of any such discussion.",
    "Any amount payable under this Clause {n} in connection with {topic} shall be paid in UAE dirhams, in immediately available funds, to the account specified by the Lender for that purpose.",
]
ADJS = ["material", "reasonable", "customary", "satisfactory", "substantial", "adverse", "continuing"]


def padding(clause_no: int, title: str, count: int, rng: random.Random) -> list[str]:
    topic = title.lower()
    picks = rng.sample(PAD_TEMPLATES, k=min(count, len(PAD_TEMPLATES)))
    while len(picks) < count:
        picks.append(rng.choice(PAD_TEMPLATES))
    return [t.format(n=clause_no, topic=topic, adj=rng.choice(ADJS)) for t in picks]

PAD_TEMPLATES += [
    "The Lender shall be entitled to rely on any certificate delivered in connection with {topic} without further enquiry, unless it has actual knowledge that the certificate is inaccurate.",
    "Any reference in this Clause {n} to a person taking a step in relation to {topic} includes that person procuring that the step is taken by another member of the Group.",
    "The Borrower shall keep the Lender informed, at reasonable intervals, of the progress of any matter relating to {topic} which could reasonably be expected to affect its ability to perform its obligations under the Finance Documents.",
    "A certificate of the Lender setting out any amount payable in connection with {topic} shall, in the absence of manifest error, be conclusive evidence of that amount.",
    "The obligations of each Obligor under this Clause {n} will not be affected by any act, omission, matter or thing which, but for this provision, would reduce, release or prejudice any of its obligations in relation to {topic}.",
    "Each Obligor shall execute such further documents and do such further acts in relation to {topic} as the Lender may reasonably require to give full effect to this Clause {n}.",
    "The Lender may delegate any of its rights or discretions under this Clause {n} in relation to {topic} to any of its Affiliates, provided that it shall remain responsible for the acts and omissions of that delegate.",
    "Where any step relating to {topic} requires the approval of a governmental authority in the United Arab Emirates, the relevant Obligor shall apply for that approval within ten (10) Business Days and diligently pursue it.",
    "For the avoidance of doubt, the provisions of this Clause {n} concerning {topic} apply equally to any Loan made before the date on which the relevant provision first applies.",
    "Any amount which an Obligor is required to pay under this Clause {n} in relation to {topic} shall be paid free of any restriction or condition and without any deduction other than a Tax Deduction required by law.",
    "In determining whether a matter relating to {topic} is {adj}, regard shall be had to the Group as a whole and to the purpose for which the relevant provision has been included in this Agreement.",
    "The Borrower confirms that the information supplied to the Lender in relation to {topic} was, at the date it was supplied, true, complete and accurate in all material respects.",
    "If the Lender requests any document relating to {topic} in electronic form, the Borrower shall supply it in a commonly used, unencrypted file format capable of being read without proprietary software.",
    "The parties acknowledge that the time periods set out in this Clause {n} in relation to {topic} are of the essence, save where this Agreement expressly provides otherwise.",
    "Any step taken by the Lender in relation to {topic} in accordance with this Clause {n} shall be without prejudice to any other right or remedy available to it under the Finance Documents.",
    "The Borrower shall procure that each member of the Group complies with this Clause {n} in relation to {topic} as if references to the Borrower were references to that member of the Group.",
    "Nothing in this Clause {n} shall be construed as an obligation on the Lender to provide any further financial accommodation in connection with {topic}.",
    "If any Obligor is in doubt as to whether a proposed action relating to {topic} is permitted under this Clause {n}, it may request the confirmation of the Lender, which shall not be unreasonably withheld or delayed.",
    "References in this Clause {n} to a document relating to {topic} being in agreed form are references to that document in the form agreed by the Borrower and the Lender and initialled for the purposes of identification.",
    "Each Obligor shall bear its own costs in connection with any review, consent or waiver relating to {topic} requested by it under this Clause {n}, save as otherwise expressly provided.",
    "The Lender shall act reasonably and in a timely manner in responding to any request relating to {topic} made by an Obligor under this Clause {n}.",
    "Any period of grace in relation to {topic} shall commence on the earlier of the date on which the Lender gives notice and the date on which the relevant Obligor becomes aware of the relevant matter.",
]


def padding(clause_no: int, title: str, count: int, rng: random.Random) -> list[str]:
    """Each padding paragraph joins two different templates, so paragraphs rarely repeat."""
    topic = title.lower()
    deck: list[str] = []
    out = []
    for _ in range(count):
        pair = []
        for _ in range(2):
            if not deck:  # reshuffle only when every template has been used once in this clause
                deck = PAD_TEMPLATES[:]
                rng.shuffle(deck)
            pair.append(deck.pop())
        out.append(" ".join(t.format(n=clause_no, topic=topic, adj=rng.choice(ADJS)) for t in pair))
    return out
