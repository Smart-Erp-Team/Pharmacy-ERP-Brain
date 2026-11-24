global using System.Net;
global using System.Net.Http.Json;
global using System.Reflection;
global using System.Security.Claims;
global using System.Text.Json;

global using Microsoft.AspNetCore.Hosting;
global using Microsoft.AspNetCore.Mvc.Testing;
global using Microsoft.AspNetCore.TestHost;
global using Microsoft.EntityFrameworkCore;
global using Microsoft.Extensions.DependencyInjection;
global using Microsoft.Extensions.DependencyInjection.Extensions;
global using Microsoft.Extensions.Hosting;
global using Microsoft.Extensions.Logging;

global using Npgsql;

global using PharmacyERP.Application.Common.DTOs;
global using PharmacyERP.Application.Common.Interfaces.Context;
global using PharmacyERP.Application.Common.Interfaces.CrossModule;
global using PharmacyERP.Application.Common.Interfaces.Integration;
global using PharmacyERP.Application.Common.Interfaces.Persistence;
global using PharmacyERP.Application.Features.Catalog.Services.Interfaces;
global using PharmacyERP.Application.Features.Identity.DTOs;
global using PharmacyERP.Application.Features.Identity.Interfaces;
global using PharmacyERP.Application.Features.Integration.DTOs;
global using PharmacyERP.Application.Features.Integration.Interfaces;
global using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
global using PharmacyERP.Domain.Entities.Catalog;
global using PharmacyERP.Domain.Entities.Identity;
global using PharmacyERP.Domain.Entities.Integration;
global using PharmacyERP.Domain.Entities.Inventory;
global using PharmacyERP.Domain.Enums;
global using PharmacyERP.Domain.ValueObjects;
global using PharmacyERP.Infrastructure.Persistence.Database;
global using PharmacyERP.Infrastructure.Persistence.Security;
global using PharmacyERP.Infrastructure.Services.Context;
