global using System.Net;
global using System.Text.Json;
global using System.Text.Json.Serialization;

global using Microsoft.AspNetCore.Authorization;
global using Microsoft.AspNetCore.Mvc;

global using Npgsql;

global using PharmacyERP.Api.Common;
global using PharmacyERP.Api.Filters;
global using PharmacyERP.Api.Logging;
global using PharmacyERP.Application.Common.Constants;
global using PharmacyERP.Application.Common.DTOs;
global using PharmacyERP.Application.Common.Interfaces.Context;
global using PharmacyERP.Application.Features.Catalog.DTOs;
global using PharmacyERP.Application.Features.Catalog.Services.Interfaces;
global using PharmacyERP.Application.Features.Identity.DTOs;
global using PharmacyERP.Application.Features.Identity.Services.Interfaces;
global using PharmacyERP.Application.Features.Integration.DTOs;
global using PharmacyERP.Application.Features.Inventory.DTOs;
global using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
global using PharmacyERP.Domain.Enums;
global using PharmacyERP.Infrastructure.Auth;
