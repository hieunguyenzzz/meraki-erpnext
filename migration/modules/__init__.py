"""
Migration modules for ERPNext.

Each module handles one ERPNext domain:
- employees: HR (Employee, Department, Designation)
- customers: CRM (Customer, Customer Group)
- suppliers: Buying (Supplier, Supplier Group, Address)
- items: Stock (Item, Item Group)
- sales: Selling (Sales Order, Sales Invoice)
- projects: Projects (Project, Task)
- accounting: Accounting (Journal Entry)
- payroll: Payroll (Salary Component, Salary Structure, Salary Structure Assignment)
"""

from . import employees
from . import customers
from . import suppliers
from . import items
from . import sales
from . import projects
from . import accounting
from . import payroll

# Module execution order (dependencies respected)
MODULES = [
    'items',       # Items needed for orders
    'employees',   # Staff for assignments
    'payroll',     # Salary structures (needs employees)
    'suppliers',   # Venues for orders
    'customers',   # Customers for orders
    'sales',       # Sales orders + invoices
    'projects',    # Projects + tasks
    'accounting',  # Journal entries
]

__all__ = [
    'employees',
    'customers',
    'suppliers',
    'items',
    'sales',
    'projects',
    'accounting',
    'payroll',
    'MODULES',
]
