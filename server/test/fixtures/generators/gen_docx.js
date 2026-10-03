// Generates the DOCX fixtures: MSA v1 + v2 (version pair), Mutual NDA, Lease.
// All parties are fictional. Clause numbers are real Word auto-numbering (not typed text).
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, LevelFormat,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, ExternalHyperlink,
  FootnoteReferenceRun, PageNumber, Tab, HeadingLevel,
} = require('docx');

const FONT = 'Times New Roman';
const t = (text, o = {}) => new TextRun({ text, font: FONT, size: 22, ...o });
const b = (text) => t(text, { bold: true });
const i = (text) => t(text, { italics: true });

// --- numbering: level 0 = "1." clause headings, level 1 = "1.1" sub-clauses
const numbering = {
  config: [{
    reference: 'clauses',
    levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 567, hanging: 567 } }, run: { bold: true, font: FONT } } },
      { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 567, hanging: 567 } }, run: { font: FONT } } },
      { level: 2, format: LevelFormat.LOWER_LETTER, text: '(%3)', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1134, hanging: 567 } }, run: { font: FONT } } },
    ],
  }],
};

const heading = (text) => new Paragraph({
  numbering: { reference: 'clauses', level: 0 }, spacing: { before: 240, after: 120 },
  keepNext: true, children: [t(text.toUpperCase(), { bold: true })],
});
// runs may be a string or an array of TextRun/hyperlink/footnote children
const clause = (runs, level = 1) => new Paragraph({
  numbering: { reference: 'clauses', level }, spacing: { after: 120 },
  alignment: AlignmentType.JUSTIFIED, children: typeof runs === 'string' ? [t(runs)] : runs,
});
const plain = (runs, o = {}) => new Paragraph({ spacing: { after: 120 }, ...o,
  children: typeof runs === 'string' ? [t(runs)] : runs });
const title = (text) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
  heading: HeadingLevel.TITLE, children: [t(text, { bold: true, size: 32 })] });

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };
function table(rows, widths) {
  const total = widths.reduce((a, c) => a + c, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c, ci) => new TableCell({
      borders, width: { size: widths[ci], type: WidthType.DXA },
      shading: ri === 0 ? { fill: 'EEEEEE', type: ShadingType.CLEAR, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [ri === 0 ? b(c) : t(c)] })],
    })) })),
  });
}

function doc(headerText, children, footnotes) {
  return new Document({
    creator: 'Contract Analyzer test fixtures',
    title: headerText,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering,
    footnotes,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1300, bottom: 1300, left: 1300 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [t(headerText, { size: 16, color: '777777' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [t('Page ', { size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT }),
          t(' of ', { size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FONT })] })] }) },
      children,
    }],
  });
}

// ------------------------------------------------------------------ MSA
function msa(v2) {
  const cap = v2 ? 'AED 1,000,000' : 'AED 100,000';
  const capWords = v2 ? '(one million UAE dirhams)' : '(one hundred thousand UAE dirhams)';
  const C = {};
  C.definitions = [heading('Definitions and Interpretation'),
    clause('In this Agreement the following words have the following meanings:'),
    plain([b('“Confidential Information”'), t(' means all information of a confidential nature disclosed by one party to the other in connection with this Agreement, in any form.')], { indent: { left: 567 } }),
    plain([b('“Contract Year”'), t(' means each period of twelve (12) months starting on the Effective Date or an anniversary of it.')], { indent: { left: 567 } }),
    plain([b('“Effective Date”'), t(' means 1 March 2026.')], { indent: { left: 567 } }),
    plain([b('“Good Industry Practice”'), t(' means the exercise of the skill, diligence, prudence and foresight which would reasonably be expected from a skilled and experienced provider of retail software services in the United Arab Emirates.')], { indent: { left: 567 } }),
    plain([b('“Services”'), t(' means the provision of the '), i('OasisPOS'), t(' cloud point-of-sale platform, hosting, support and related services described in Schedule 1.')], { indent: { left: 567 } }),
    clause('Clause headings do not affect the interpretation of this Agreement, and words in the singular include the plural and vice versa.'),
  ];
  C.term = [heading('Commencement and Term'),
    clause('This Agreement commences on the Effective Date and continues for an initial term of thirty-six (36) months, unless terminated earlier in accordance with its terms.'),
    clause('This Agreement shall renew automatically for successive periods of twelve (12) months unless either party gives notice of non-renewal at least ninety (90) days before the end of the then current term.'),
  ];
  C.services = [heading('Services'),
    clause('The Supplier shall provide the Services to the Customer from the Effective Date in accordance with Good Industry Practice and this Agreement.'),
    clause('The Supplier shall host the platform on servers located in the United Arab Emirates and shall not transfer Customer data outside the United Arab Emirates without the Customer’s prior written consent.'),
    clause('The Supplier may engage subcontractors to perform any part of the Services, but shall remain responsible for all acts and omissions of its subcontractors as if they were its own.'),
  ];
  C.implementation = [heading('Implementation and Onboarding'),
    clause('The Supplier shall complete the configuration of the platform for all forty-two (42) Customer stores within ninety (90) days of the Effective Date.'),
    clause('The Supplier shall provide on-site training for up to two hundred (200) Customer staff members during the implementation period at no additional charge.'),
  ];
  C.serviceLevels = [heading('Service Levels'),
    clause('The Supplier shall ensure that the platform is available 99.5 per cent. of the time in each calendar month, measured in accordance with Good Industry Practice and excluding scheduled maintenance notified at least five (5) Business Days in advance.'),
    clause('If the Supplier fails to meet the availability service level in any calendar month, the Customer shall be entitled to a service credit of 5 per cent. of the monthly platform fee for each full 0.5 per cent. shortfall, up to a maximum of 25 per cent. of that monthly fee.'),
  ];
  const feeRows = [['Charge', 'Amount (AED, excl. VAT)', 'Payable'],
    ['Platform fee (42 stores)', '45,000', 'Monthly in advance'],
    ['Support Services', v2 ? '15,000' : '12,000', 'Monthly in advance'],
    ['Implementation (one-off)', '60,000', 'On go-live']];
  C.fees = [heading('Fees and Payment'),
    clause('In consideration of the Services, the Customer shall pay the fees set out in the table below.'),
    table(feeRows, [3800, 2900, 2600]),
    clause([t('The Supplier shall invoice the Customer monthly in advance and the Customer shall pay each undisputed invoice within thirty (30) days of receipt. All fees are exclusive of value added tax, which shall be added at the prevailing rate'), new FootnoteReferenceRun(1), t('.')]),
    clause(`If the Customer fails to pay any undisputed amount by the due date, the Supplier may charge interest on the overdue amount at the rate of ${v2 ? '2' : '1.5'} per cent. per month from the due date until the date of payment.`),
  ];
  C.customer = [heading('Customer Obligations'),
    clause([t('The Customer shall use the Services in accordance with the Supplier’s acceptable use policy available at '),
      new ExternalHyperlink({ link: 'https://falconridge.example/acceptable-use', children: [new TextRun({ text: 'falconridge.example/acceptable-use', style: 'Hyperlink', font: FONT, size: 22 })] }),
      t(', as updated from time to time on not less than thirty (30) days’ notice.')]),
    clause('The Customer shall provide the Supplier with such access to its premises, systems and personnel as the Supplier reasonably requires to perform the Services.'),
  ];
  C.ip = [heading('Intellectual Property'),
    clause('All intellectual property rights in the platform and the Services belong to the Supplier or its licensors. The Supplier grants the Customer a non-exclusive, non-transferable licence to use the platform during the term solely for its internal business purposes.'),
    clause('All data entered into the platform by or on behalf of the Customer remains the property of the Customer.'),
  ];
  C.confidentiality = [heading('Confidentiality'),
    clause(v2 ? 'Each party shall use Confidential Information received from the other party solely for the purposes of performing its obligations under this Agreement.'
             : 'Each party shall use the other party’s Confidential Information solely for the purpose of performing its obligations under this Agreement.'),
    clause('The obligations in this clause survive termination of this Agreement for a period of three (3) years.'),
  ];
  C.nonSolicit = [heading('Non-Solicitation'),
    clause('Neither party shall, during the term of this Agreement and for twelve (12) months after its termination, solicit or entice away any employee of the other party who has been engaged in the provision or receipt of the Services.'),
  ];
  C.warranties = [heading('Warranties'),
    clause('Each party warrants that it has full capacity and authority to enter into and perform this Agreement.'),
    clause('The Supplier warrants that the Services will be performed with reasonable skill and care and that the platform will perform materially in accordance with its documentation.'),
  ];
  C.insurance = [heading('Insurance'),
    clause(`The Supplier ${v2 ? 'may' : 'shall'} maintain professional indemnity insurance with a limit of not less than AED 2,000,000 for each claim with a reputable insurer licensed in the United Arab Emirates.`),
  ];
  C.liability = [heading('Limitation of Liability'),
    clause('Nothing in this Agreement limits or excludes either party’s liability for fraud, wilful misconduct, or death or personal injury caused by negligence.'),
    clause([t('Subject to the clause above, the Supplier’s total aggregate liability arising out of or in connection with this Agreement shall not exceed '), b(cap), t(` ${capWords} in any Contract Year.`)]),
    clause('Neither party shall be liable to the other for any loss of profit, loss of revenue or any indirect or consequential loss.'),
  ];
  C.indemnities = [heading('Indemnities'),
    clause('The Supplier shall indemnify the Customer against all losses arising from any claim that the Customer’s use of the platform in accordance with this Agreement infringes the intellectual property rights of a third party, subject to the Limitation of Liability clause.'),
  ];
  C.termination = [heading('Termination'),
    clause(`Either party may terminate this Agreement for convenience by giving the other party not less than ${v2 ? 'sixty (60)' : 'thirty (30)'} days’ written notice.`),
    clause('Either party may terminate this Agreement with immediate effect by written notice if the other party commits a material breach which is not remedied within fourteen (14) days of being notified of the breach.'),
    clause('On termination the Supplier shall, at the Customer’s request, export all Customer data in CSV format within thirty (30) days.'),
  ];
  C.notices = [heading('Notices'),
    clause([t('Notices to the Supplier shall be sent to: Falcon Ridge Technologies FZ-LLC, Building 5, Office 302, Dubai Internet City, Dubai, United Arab Emirates.'), new TextRun({ break: 1 }), new TextRun({ font: FONT, size: 22, children: ['Attention:', new Tab(), 'General Counsel'] })]),
    clause([t('Notices to the Customer shall be sent to: Oasis Retail Group LLC, 8th Floor, Al Wasl Square, Al Wasl Road, Dubai, United Arab Emirates.'), new TextRun({ break: 1 }), new TextRun({ font: FONT, size: 22, children: ['Attention:', new Tab(), 'Chief Operating Officer'] })]),
  ];
  C.law = [heading('Governing Law and Jurisdiction'),
    clause(v2 ? 'This Agreement is governed by the laws of the Abu Dhabi Global Market.' : 'This Agreement is governed by the laws of the Dubai International Financial Centre.'),
    clause(v2 ? 'The courts of the Abu Dhabi Global Market shall have exclusive jurisdiction to settle any dispute arising out of or in connection with this Agreement.'
             : 'The courts of the Dubai International Financial Centre shall have exclusive jurisdiction to settle any dispute arising out of or in connection with this Agreement.'),
  ];
  C.entire = [heading('Entire Agreement'),
    clause(v2 ? 'This Agreement constitutes the entire agreement between the parties and supersedes all previous agreements, promises and understandings between them relating to its subject matter.'
             : 'This Agreement constitutes the entire agreement between the parties, and supersedes all previous agreements, promises and understandings between them relating to its subject matter.'),
  ];
  C.counterparts = [heading('Counterparts'),
    clause('This Agreement may be executed in any number of counterparts, each of which when executed shall constitute a duplicate original.'),
  ];

  const order = v2
    ? ['definitions', 'term', 'services', 'implementation', 'serviceLevels', 'fees', 'customer', 'ip', 'confidentiality', 'nonSolicit', 'warranties', 'insurance', 'liability', 'indemnities', 'termination', 'law', 'entire', 'notices']
    : ['definitions', 'term', 'services', 'serviceLevels', 'fees', 'customer', 'ip', 'confidentiality', 'nonSolicit', 'warranties', 'insurance', 'liability', 'indemnities', 'termination', 'notices', 'law', 'entire', 'counterparts'];

  const children = [title('MASTER SERVICES AGREEMENT'),
    plain([t('This Agreement is dated '), b('2 February 2026'), t(' and made between:')]),
    plain([t('(1)  '), b('Falcon Ridge Technologies FZ-LLC'), t(', a free zone company incorporated in Dubai Internet City with licence number 94117 (the “'), b('Supplier'), t('”); and')]),
    plain([t('(2)  '), b('Oasis Retail Group LLC'), t(', a limited liability company incorporated in the Emirate of Dubai with commercial licence number 671205 (the “'), b('Customer'), t('”).')]),
    plain(v2 ? 'Version 2 – Customer comments incorporated' : 'Version 1 – Supplier draft'),
    ...order.flatMap((k) => C[k]),
    plain(''),
    plain([b('Signed'), t(' for and on behalf of Falcon Ridge Technologies FZ-LLC: ____________________')]),
    plain([b('Signed'), t(' for and on behalf of Oasis Retail Group LLC: ____________________')]),
  ];
  const footnotes = { 1: { children: [new Paragraph({ children: [t('Value added tax is currently charged at 5 per cent. under UAE Federal Decree-Law No. 8 of 2017.', { size: 18 })] })] } };
  return doc('Master Services Agreement – Falcon Ridge / Oasis Retail – Confidential', children, footnotes);
}

// ------------------------------------------------------------------ NDA
function nda() {
  return doc('Mutual Non-Disclosure Agreement – Sahra Logistics / Blue Dhow Ventures', [
    title('MUTUAL NON-DISCLOSURE AGREEMENT'),
    plain([t('This Agreement is dated '), b('10 January 2026'), t(' between '), b('Sahra Logistics LLC'), t(', of Office 210, Khalifa Park, Abu Dhabi (“Sahra”), and '), b('Blue Dhow Ventures Ltd'), t(', a company registered in the Abu Dhabi Global Market with registered number 000-4421 (“Blue Dhow”).')]),
    plain('The parties wish to evaluate a possible joint venture for temperature-controlled freight between Khalifa Port and Riyadh (the “Purpose”) and will exchange confidential information for that Purpose.'),
    heading('Confidential Information'),
    clause('“Confidential Information” means any information, in any form, disclosed by one party (the Discloser) to the other (the Recipient) in connection with the Purpose, including pricing, customer lists, route plans and financial projections.'),
    heading('Obligations of the Recipient'),
    clause('The Recipient shall keep the Discloser’s Confidential Information strictly confidential, use it only for the Purpose, and disclose it only to its employees and advisers who need to know it for the Purpose and who are bound by equivalent obligations.'),
    clause('The Recipient shall apply to the Discloser’s Confidential Information no lesser security measures and degree of care than those it applies to its own confidential information.'),
    heading('Exceptions'),
    clause('The obligations in this Agreement do not apply to information which is or becomes public other than through a breach of this Agreement, was lawfully in the Recipient’s possession before disclosure, or is required to be disclosed by law or by any court or regulator, including the Financial Services Regulatory Authority.'),
    heading('Duration'),
    clause('This Agreement continues for two (2) years from its date. The obligations of confidentiality continue for five (5) years after the expiry or termination of this Agreement.'),
    heading('Return of Information'),
    clause('On written request, the Recipient shall within ten (10) days return or destroy all Confidential Information of the Discloser and confirm in writing that it has done so.'),
    heading('Remedies'),
    clause('Each party acknowledges that damages alone may not be an adequate remedy for a breach of this Agreement and that the Discloser shall be entitled to seek injunctive relief for any threatened or actual breach.'),
    heading('No Licence and No Obligation'),
    clause('Nothing in this Agreement grants any licence over intellectual property, and nothing obliges either party to proceed with the joint venture.'),
    heading('Governing Law and Jurisdiction'),
    clause('This Agreement is governed by the laws of the Abu Dhabi Global Market, and the courts of the Abu Dhabi Global Market have exclusive jurisdiction over any dispute arising from it.'),
    plain([b('Signed'), t(' for Sahra Logistics LLC: ____________________      '), b('Signed'), t(' for Blue Dhow Ventures Ltd: ____________________')]),
  ]);
}

// ------------------------------------------------------------------ Lease
function lease() {
  return doc('Commercial Lease – Unit 1204, Marina Plaza Tower B', [
    title('COMMERCIAL LEASE AGREEMENT'),
    plain([t('This Lease is dated '), b('15 April 2026'), t(' between '), b('Marina Plaza Properties LLC'), t(' (the “Landlord”) and '), b('Oasis Retail Group LLC'), t(' (the “Tenant”).')]),
    heading('Premises and Term'),
    clause('The Landlord lets to the Tenant office Unit 1204, Marina Plaza Tower B, Dubai Marina, Dubai, with a net area of 2,150 square feet (the “Premises”).'),
    clause('The term is three (3) years starting on 1 May 2026 and ending on 30 April 2029.'),
    heading('Rent and Deposit'),
    clause('The annual rent is AED 180,000 (one hundred and eighty thousand UAE dirhams), payable by four (4) post-dated cheques of AED 45,000 each, due on 1 May, 1 August, 1 November and 1 February of each year.'),
    clause('The Tenant shall pay a refundable security deposit of AED 9,000 on signing, to be returned within thirty (30) days after the end of the term less any amounts properly deducted for damage beyond fair wear and tear.'),
    clause('The Tenant shall register this Lease with Ejari within fourteen (14) days of signing, at the Tenant’s cost.'),
    heading('Use and Maintenance'),
    clause('The Premises shall be used only as administrative offices. The Landlord is responsible for structural repairs and central air-conditioning; the Tenant is responsible for minor internal maintenance.'),
    heading('Early Termination'),
    clause('The Tenant may terminate this Lease early by giving not less than ninety (90) days’ written notice and paying a fee equal to two (2) months’ rent.'),
    heading('Landlord’s Liability'),
    clause('The Landlord’s total liability to the Tenant under or in connection with this Lease is limited to AED 45,000 (forty-five thousand UAE dirhams), except in the case of the Landlord’s gross negligence or wilful misconduct.'),
    heading('Disputes'),
    clause('This Lease is governed by the laws of the Emirate of Dubai and the federal laws of the United Arab Emirates. Any rental dispute shall be referred to the Rental Dispute Settlement Centre in Dubai.'),
    plain([b('Signed'), t(' for the Landlord: ____________________      '), b('Signed'), t(' for the Tenant: ____________________')]),
  ]);
}

(async () => {
  const out = 'out/';
  const files = { '10-msa-v1.docx': msa(false), '11-msa-v2.docx': msa(true), '20-nda-mutual.docx': nda(), '21-lease-marina-plaza.docx': lease() };
  for (const [name, d] of Object.entries(files)) fs.writeFileSync(out + name, await Packer.toBuffer(d));
  console.log('written', Object.keys(files).join(', '));
})();
